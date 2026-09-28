#!/usr/bin/env python3


'''
*****************************************************************************************
*
*        		===============================================
*           		        StrataCobot (SC) Theme (eYRC 2026-27)
*        		===============================================
*
*  This script should be used to implement Task 1C of StrataCobot (SC) Theme (eYRC 2026-27).
*
*  This software is made available on an "AS IS WHERE IS BASIS".
*  Licensee/end user indemnifies and will keep e-Yantra indemnified from
*  any and all claim(s) that emanate from the use of the Software or
*  breach of the terms of this agreement.
*
*****************************************************************************************
'''

# Team ID:          4040
# Author List:		Ganesh,Sharvari,Vrushali
# Filename:		    task1c.py
# Functions:        wrap_angle, yaw_from_quaternion, clamp, grid_index,
#                   vicinity_occupied, segment_blocked, beam_clearance,
#                   choose_command
# Nodes:		    ebot_nav_node
#			        Publishing Topics  - [ /cmd_vel ]
#                   Subscribing Topics - [ /ebot_path, /map, /odom, /scan ]


################### IMPORT MODULES #######################

import math
import sys

import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import OccupancyGrid, Odometry, Path
from rclpy.node import Node
from rclpy.qos import (
    DurabilityPolicy,
    HistoryPolicy,
    QoSProfile,
    ReliabilityPolicy,
    qos_profile_sensor_data,
)
from sensor_msgs.msg import LaserScan


##################### TASK CONSTANTS #######################

# The route is published here ONCE, before your node starts, and held for late
# subscribers. An ordinary subscription waits forever for a message already sent.
path_topic = '/ebot_path'
map_topic = '/map'

odom_topic = '/odom'
scan_topic = '/scan'
cmd_topic = '/cmd_vel'

# What /cmd_vel accepts. The base clips anything beyond these, and clipping one of the
# two changes their ratio - which is the arc the base actually drives.
max_linear_mps = 0.5
max_angular_rps = 1.0

# Graded radius is 0.5 m. Stop inside that, after the pose is actually reached.
waypoint_reach_m = 0.32
final_reach_m = 0.15
# Accept a waypoint a rock is sitting on, once we have been beside it long enough.
blocked_accept_m = 0.48
blocked_accept_cycles = 40

cruise_mps = 0.32
yaw_gain = 1.45
avoid_front_m = 0.70
slow_front_m = 1.15
hard_front_m = 0.40
map_inflate_m = 0.34
map_lookahead_m = 1.20
occupied_threshold = 50


##################### PURE CONTROLLER #######################

def wrap_angle(angle):
    '''
    Wrap an angle in radians to (-pi, pi].

    Args:
        angle (float): Angle in radians

    Returns:
        float: Wrapped angle
    '''
    return math.atan2(math.sin(angle), math.cos(angle))


def yaw_from_quaternion(x, y, z, w):
    '''
    Yaw of a quaternion, using the Z axis of the base.

    Args:
        x (float): Quaternion x
        y (float): Quaternion y
        z (float): Quaternion z
        w (float): Quaternion w

    Returns:
        float: Yaw in radians
    '''
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def clamp(value, low, high):
    '''
    Clamp value to [low, high].

    Args:
        value (float): Number to clamp
        low (float): Lower bound
        high (float): Upper bound

    Returns:
        float: Clamped number
    '''
    return max(low, min(high, value))


def grid_index(x, y, origin_x, origin_y, resolution, width, height):
    '''
    Row-major index of a world point in an occupancy grid.

    Args:
        x (float): World x
        y (float): World y
        origin_x (float): World x of cell (0, 0)
        origin_y (float): World y of cell (0, 0)
        resolution (float): Metres per cell
        width (int): Grid width in cells
        height (int): Grid height in cells

    Returns:
        int or None: Index into the row-major data, or None if outside the grid
    '''
    if resolution <= 0.0:
        return None
    col = int((x - origin_x) / resolution)
    row = int((y - origin_y) / resolution)
    if col < 0 or row < 0 or col >= width or row >= height:
        return None
    return row * width + col


def vicinity_occupied(x, y, grid, inflate_m):
    '''
    True when an occupied cell lies within inflate_m of (x, y).

    Args:
        x (float): World x
        y (float): World y
        grid (object): Occupancy view with origin, resolution, size, and data
        inflate_m (float): Radius to treat as the rover body

    Returns:
        bool: Whether the neighbourhood is occupied
    '''
    if grid is None:
        return False
    samples = [(x, y)]
    for step in range(8):
        ang = step * (math.pi / 4.0)
        samples.append((
            x + inflate_m * math.cos(ang),
            y + inflate_m * math.sin(ang),
        ))
    for sx, sy in samples:
        idx = grid_index(
            sx, sy, grid.origin_x, grid.origin_y,
            grid.resolution, grid.width, grid.height)
        if idx is None:
            continue
        if grid.data[idx] >= occupied_threshold:
            return True
    return False


def segment_blocked(x, y, tx, ty, grid, inflate_m, lookahead_m):
    '''
    True when the line toward the waypoint hits an occupied cell within lookahead_m.

    Args:
        x (float): Rover x
        y (float): Rover y
        tx (float): Target x
        ty (float): Target y
        grid (object): Occupancy view
        inflate_m (float): Body radius
        lookahead_m (float): How far along the segment to inspect

    Returns:
        bool: Whether the upcoming segment is blocked
    '''
    if grid is None:
        return False
    dx = tx - x
    dy = ty - y
    dist = math.hypot(dx, dy)
    if dist < 1e-6:
        return vicinity_occupied(x, y, grid, inflate_m)
    travel = min(dist, lookahead_m)
    steps = max(1, int(travel / 0.10))
    for step in range(1, steps + 1):
        scale = (travel * step / steps) / dist
        if vicinity_occupied(x + dx * scale, y + dy * scale, grid, inflate_m):
            return True
    return False


def beam_clearance(beams):
    '''
    Nearest valid range ahead, to the left, and to the right.

    Args:
        beams (iterable): Pairs of (angle_rad, range_m). Angle 0 is straight ahead,
            positive is left. Invalid returns must already have been dropped.

    Returns:
        tuple: (front_m, left_m, right_m). Missing sides are math.inf.
    '''
    front = math.inf
    left = math.inf
    right = math.inf
    front_cone = math.radians(28.0)
    side_cone = math.radians(90.0)
    for ang, rng in beams:
        if abs(ang) <= front_cone:
            front = min(front, rng)
        elif 0.0 < ang <= side_cone:
            left = min(left, rng)
        elif -side_cone <= ang < 0.0:
            right = min(right, rng)
    return front, left, right


def _valid_beams(scan):
    '''
    Lidar hits that are real measurements. inf is no return, not a zero-range hit.

    Args:
        scan (LaserScan): One sweep

    Returns:
        list: (angle_rad, range_m) pairs
    '''
    beams = []
    if scan is None:
        return beams
    range_min = scan.range_min
    range_max = scan.range_max
    for index, rng in enumerate(scan.ranges):
        if not math.isfinite(rng):
            continue
        if rng < range_min or rng > range_max:
            continue
        angle = scan.angle_min + index * scan.angle_increment
        beams.append((angle, rng))
    return beams


def choose_command(x, y, yaw, waypoints, index, beams, grid, blocked_cycles):
    '''
    One control cycle: pursue the current waypoint, and bias off rocks.

    Args:
        x (float): Rover x in the map frame
        y (float): Rover y in the map frame
        yaw (float): Rover yaw in radians
        waypoints (list): (x, y) poses in route order
        index (int): Waypoint currently being pursued
        beams (list): Valid (angle, range) lidar hits
        grid (object or None): Occupancy view of /map
        blocked_cycles (int): How many recent cycles the current pose was blocked

    Returns:
        tuple: (linear_mps, angular_rps, index, blocked_cycles, done)
    '''
    if not waypoints or index >= len(waypoints):
        return 0.0, 0.0, index, 0, True

    while index < len(waypoints) - 1:
        wx, wy = waypoints[index]
        if math.hypot(wx - x, wy - y) > waypoint_reach_m:
            break
        index += 1
        blocked_cycles = 0

    wx, wy = waypoints[index]
    dx = wx - x
    dy = wy - y
    dist = math.hypot(dx, dy)
    heading_err = wrap_angle(math.atan2(dy, dx) - yaw)
    last = index >= len(waypoints) - 1

    if last and dist <= final_reach_m:
        return 0.0, 0.0, index, 0, True

    front, left, right = beam_clearance(beams)
    map_blocked = segment_blocked(
        x, y, wx, wy, grid, map_inflate_m, map_lookahead_m)
    front_blocked = front < avoid_front_m
    blocked = front_blocked or map_blocked

    if blocked and not last and dist <= blocked_accept_m:
        blocked_cycles += 1
        if blocked_cycles >= blocked_accept_cycles:
            return 0.0, 0.0, index + 1, 0, False
    else:
        blocked_cycles = 0

    # Face the waypoint. Forward speed falls as the heading error grows, because
    # the skid-steer turn rate does not match the command; /odom yaw is the feedback.
    align = max(0.0, math.cos(heading_err))
    linear = cruise_mps * align
    if align < 0.15:
        linear = 0.05
    linear *= clamp(dist / 0.40, 0.2, 1.0)
    angular = yaw_gain * heading_err

    if front < slow_front_m:
        linear = min(linear, 0.16)
    if map_blocked:
        linear = min(linear, 0.14)

    if front < hard_front_m:
        linear = 0.0
        angular = 0.95 if left >= right else -0.95
    elif front_blocked or map_blocked:
        if left == right:
            turn = 0.85 if heading_err >= 0.0 else -0.85
        else:
            turn = 0.85 if left > right else -0.85
        if map_blocked and not front_blocked:
            # Scan has not seen the rock yet. Prefer the side the grid leaves open.
            left_x = x + 0.65 * math.cos(yaw + 0.9)
            left_y = y + 0.65 * math.sin(yaw + 0.9)
            right_x = x + 0.65 * math.cos(yaw - 0.9)
            right_y = y + 0.65 * math.sin(yaw - 0.9)
            left_open = not vicinity_occupied(left_x, left_y, grid, map_inflate_m)
            right_open = not vicinity_occupied(right_x, right_y, grid, map_inflate_m)
            if left_open and not right_open:
                turn = 0.85
            elif right_open and not left_open:
                turn = -0.85
        angular = 0.72 * turn + 0.28 * angular

    linear = clamp(linear, -max_linear_mps, max_linear_mps)
    angular = clamp(angular, -max_angular_rps, max_angular_rps)
    return linear, angular, index, blocked_cycles, False


##################### CLASS DEFINITION #######################

class GridView(object):
    '''
    Plain view of an OccupancyGrid, shared by the node and the offline checks.
    '''

    def __init__(self, data, width, height, resolution, origin_x, origin_y):
        self.data = data
        self.width = width
        self.height = height
        self.resolution = resolution
        self.origin_x = origin_x
        self.origin_y = origin_y


class ebot_nav(Node):
    '''
    ___CLASS___

    Description:    Class which serves the purpose to drive the eBot along the route
                    published on /ebot_path, through its waypoints, in order.
    '''

    def __init__(self):
        '''
        Description:    Initialization of class ebot_nav
        '''

        # use_sim_time is set here, not on the command line, so this node runs on the
        # simulation clock however it is started.
        super().__init__(                                                               # registering node
            'ebot_nav_node',
            parameter_overrides=[rclpy.parameter.Parameter(
                'use_sim_time', rclpy.Parameter.Type.BOOL, True)])

        ############ Topic SUBSCRIPTIONS ############

        # The route and the rock grid are latched. A volatile subscription misses both.
        latched_qos = QoSProfile(
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
        )
        self.path_sub = self.create_subscription(Path, path_topic, self.pathcb, latched_qos)
        self.map_sub = self.create_subscription(
            OccupancyGrid, map_topic, self.mapcb, latched_qos)
        self.odom_sub = self.create_subscription(Odometry, odom_topic, self.odomcb, 10)
        self.scan_sub = self.create_subscription(
            LaserScan, scan_topic, self.scancb, qos_profile_sensor_data)

        ############ Topic PUBLISHERS ############

        self.cmd_pub = self.create_publisher(Twist, cmd_topic, 10)                      # the eBot drives on what you publish here

        ############ Constructor VARIABLES/OBJECTS ############

        control_rate = 0.05                                                             # rate of time to run one control cycle (seconds)
        self.timer = self.create_timer(control_rate, self.process_navigation)           # creating a timer based function which gets called on every 0.05 seconds (as defined by 'control_rate' variable)

        self.route = None                                                               # the route to drive (from pathcb())
        self.odom = None                                                                # where the base is (from odomcb())
        self.scan = None                                                                # what the lidar sees (from scancb())
        self.grid = None                                                                # rock layout (from mapcb())

        self.waypoints = []
        self.wp_index = 0
        self.x = 0.0
        self.y = 0.0
        self.yaw = 0.0
        self.blocked_cycles = 0
        self.done = False

    def pathcb(self, data):
        '''
        Description:    Callback function for the route topic.
                        Use this function to receive the waypoints the eBot has to drive.

        Args:
            data (Path):    The route, as a sequence of poses

        Returns:
        '''
        # Take the route once. Replacing it mid-run would reset the waypoint index.
        if self.route is not None:
            return

        self.waypoints = [
            (pose.pose.position.x, pose.pose.position.y) for pose in data.poses
        ]
        self.route = data
        frame = data.header.frame_id if data.header is not None else ''
        self.get_logger().info(
            'Route received: %d poses in frame %s' % (len(self.waypoints), frame))

    def mapcb(self, data):
        '''
        Description:    Callback for the latched occupancy grid of the rocks.

        Args:
            data (OccupancyGrid): Arena grid

        Returns:
        '''
        info = data.info
        origin = info.origin.position
        self.grid = GridView(
            data=list(data.data),
            width=info.width,
            height=info.height,
            resolution=info.resolution,
            origin_x=origin.x,
            origin_y=origin.y,
        )

    def odomcb(self, data):
        '''
        Description:    Callback function for the odometry topic.
                        Use this function to receive where the base currently is.

        Args:
            data (Odometry):    Pose and velocity of the base

        Returns:
        '''
        position = data.pose.pose.position
        quat = data.pose.pose.orientation
        self.x = position.x
        self.y = position.y
        self.yaw = yaw_from_quaternion(quat.x, quat.y, quat.z, quat.w)
        self.odom = data

    def scancb(self, data):
        '''
        Description:    Callback function for the lidar topic.
                        Use this function to receive what the lidar currently sees.

        Args:
            data (LaserScan):    One lidar sweep

        Returns:
        '''
        self.scan = data

    def _publish(self, linear_x, angular_z):
        '''
        Publish one Twist. Only linear.x and angular.z move the skid-steer base.

        Args:
            linear_x (float): Forward speed, metres per second
            angular_z (float): Yaw rate, radians per second

        Returns:
        '''
        command = Twist()
        command.linear.x = float(clamp(linear_x, -max_linear_mps, max_linear_mps))
        command.angular.z = float(clamp(angular_z, -max_angular_rps, max_angular_rps))
        self.cmd_pub.publish(command)

    def process_navigation(self):
        '''
        Description:    Timer function used to drive the eBot along the route.

        Args:
        Returns:
        '''
        try:
            if self.done:
                self._publish(0.0, 0.0)
                return
            # Route, pose, scan, and the rock grid all have to be in before the base moves.
            if self.route is None or self.odom is None or self.scan is None or self.grid is None:
                return

            linear, angular, self.wp_index, self.blocked_cycles, done = choose_command(
                self.x,
                self.y,
                self.yaw,
                self.waypoints,
                self.wp_index,
                _valid_beams(self.scan),
                self.grid,
                self.blocked_cycles,
            )
            if done and not self.done:
                self.get_logger().info('Route complete. Stopping on the last waypoint.')
            self.done = done
            self._publish(linear, angular)
        except Exception as exc:                                                        # a raised error kills the node and leaves the base coasting
            self.get_logger().error('Navigation cycle failed: %s' % exc)
            self._publish(0.0, 0.0)


##################### FUNCTION DEFINITION #######################

def main():
    '''
    Description:    Main function which creates a ROS node and spins around for the
                    ebot_nav class to perform its task
    '''

    rclpy.init(args=sys.argv)                                       # initialisation

    node = rclpy.create_node('ebot_nav_process')                    # creating ROS node

    node.get_logger().info('Node created: eBot navigation process') # logging information

    ebot_nav_class = ebot_nav()                                     # creating a new object for class 'ebot_nav'

    rclpy.spin(ebot_nav_class)                                      # spining on the object to make it alive in ROS 2 DDS

    ebot_nav_class.destroy_node()                                   # destroy node after spin ends

    rclpy.shutdown()                                                # shutdown process


if __name__ == '__main__':

    main()
