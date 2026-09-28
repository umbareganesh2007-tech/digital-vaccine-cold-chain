'''Offline checks for the Task 1C controller. ROS 2 is not required.'''

import math
import sys
import types
from pathlib import Path


def _install_ros_stubs():
    def mod(name):
        module = types.ModuleType(name)
        sys.modules[name] = module
        return module

    rclpy = mod('rclpy')
    rclpy.init = lambda *args, **kwargs: None
    rclpy.spin = lambda *args, **kwargs: None
    rclpy.shutdown = lambda *args, **kwargs: None
    rclpy.create_node = lambda *args, **kwargs: None

    class Parameter:
        class Type:
            BOOL = 1

        def __init__(self, *args, **kwargs):
            pass

    rclpy.parameter = types.SimpleNamespace(Parameter=Parameter)

    node = mod('rclpy.node')

    class Node:
        def __init__(self, *args, **kwargs):
            pass

    node.Node = Node

    qos = mod('rclpy.qos')

    class QoSProfile:
        def __init__(self, *args, **kwargs):
            pass

    class _Policy:
        KEEP_LAST = 1
        RELIABLE = 1
        TRANSIENT_LOCAL = 1

    qos.QoSProfile = QoSProfile
    qos.HistoryPolicy = _Policy
    qos.ReliabilityPolicy = _Policy
    qos.DurabilityPolicy = _Policy
    qos.qos_profile_sensor_data = object()

    geometry = mod('geometry_msgs')
    geometry_msg = mod('geometry_msgs.msg')

    class Twist:
        pass

    geometry_msg.Twist = Twist
    geometry.msg = geometry_msg

    nav = mod('nav_msgs')
    nav_msg = mod('nav_msgs.msg')

    class OccupancyGrid:
        pass

    class Odometry:
        pass

    class Path:
        pass

    nav_msg.OccupancyGrid = OccupancyGrid
    nav_msg.Odometry = Odometry
    nav_msg.Path = Path
    nav.msg = nav_msg

    sensor = mod('sensor_msgs')
    sensor_msg = mod('sensor_msgs.msg')

    class LaserScan:
        pass

    sensor_msg.LaserScan = LaserScan
    sensor.msg = sensor_msg


def _load_task():
    _install_ros_stubs()
    import importlib.util
    path = Path(__file__).resolve().parents[1] / 'algorithms' / 'scripts' / 'task1c' / 'task1c.py'
    spec = importlib.util.spec_from_file_location('task1c_under_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Grid(object):
    def __init__(self, width, height, resolution=0.1, origin_x=0.0, origin_y=0.0, occupied=()):
        self.width = width
        self.height = height
        self.resolution = resolution
        self.origin_x = origin_x
        self.origin_y = origin_y
        self.data = [0] * (width * height)
        for col, row in occupied:
            self.data[row * width + col] = 100


def test_wrap_and_yaw():
    task = _load_task()
    assert abs(task.wrap_angle(3.0 * math.pi) - math.pi) < 1e-9
    assert abs(task.wrap_angle(-3.0 * math.pi) + math.pi) < 1e-9
    assert abs(task.yaw_from_quaternion(0.0, 0.0, 0.0, 1.0)) < 1e-9
    half = math.sin(math.pi / 4.0)
    assert abs(task.yaw_from_quaternion(0.0, 0.0, half, half) - math.pi / 2.0) < 1e-9


def test_pursues_in_order_and_stops_on_the_last():
    task = _load_task()
    waypoints = [(0.0, 0.0), (0.67, 0.0), (1.34, 0.0)]
    grid = Grid(40, 40)
    linear, angular, index, cycles, done = task.choose_command(
        0.0, 0.0, 0.0, waypoints, 0, [], grid, 0)
    assert index == 1
    assert not done
    assert linear > 0.1
    assert abs(angular) < 0.2
    assert cycles == 0

    linear, angular, index, cycles, done = task.choose_command(
        0.20, 0.0, 0.0, waypoints, 1, [], grid, 0)
    assert index == 1
    assert not done
    assert linear > 0.0

    linear, angular, index, cycles, done = task.choose_command(
        1.34, 0.02, 0.0, waypoints, 2, [], grid, 0)
    assert done
    assert linear == 0.0
    assert angular == 0.0
    assert index == 2


def test_does_not_skip_a_missed_waypoint():
    task = _load_task()
    waypoints = [(0.0, 0.0), (0.67, 0.0), (1.34, 0.0)]
    grid = Grid(40, 40)
    _, _, index, _, done = task.choose_command(
        1.34, 0.0, 0.0, waypoints, 0, [], grid, 0)
    assert index == 0
    assert not done


def test_turns_toward_a_waypoint_behind_and_stays_inside_limits():
    task = _load_task()
    waypoints = [(0.0, 0.0), (-1.0, 0.0)]
    grid = Grid(40, 40)
    linear, angular, index, _, done = task.choose_command(
        0.0, 0.0, 0.0, waypoints, 1, [], grid, 0)
    assert index == 1
    assert not done
    assert abs(angular) > 0.5
    assert abs(linear) <= task.max_linear_mps
    assert abs(angular) <= task.max_angular_rps
    assert linear < 0.1


def test_steers_left_around_a_front_obstacle():
    task = _load_task()
    waypoints = [(0.0, 0.0), (2.0, 0.0)]
    grid = Grid(50, 50)
    beams = [(-0.2, 0.45), (0.0, 0.40), (0.2, 0.50), (1.0, 3.0), (-1.2, 0.35)]
    linear, angular, index, _, done = task.choose_command(
        0.0, 0.0, 0.0, waypoints, 1, beams, grid, 0)
    assert not done
    assert index == 1
    assert angular > 0.3
    assert linear < 0.2


def test_inf_beams_are_not_obstacles():
    task = _load_task()

    class Scan(object):
        def __init__(self):
            self.angle_min = -math.pi / 2.0
            self.angle_increment = math.pi / 2.0
            self.range_min = 0.2
            self.range_max = 8.0
            self.ranges = [float('inf'), 4.0, float('inf')]

    beams = task._valid_beams(Scan())
    assert beams == [(0.0, 4.0)]
    front, left, right = task.beam_clearance(beams)
    assert front == 4.0
    assert math.isinf(left) and math.isinf(right)


def test_map_block_biases_away_from_the_occupied_side():
    task = _load_task()
    # Cell size 0.1 m. Occupy the corridor ahead and slightly to the rover's left.
    occupied = [(12, 8), (13, 8), (14, 8), (12, 9), (13, 9)]
    grid = Grid(40, 40, occupied=occupied)
    waypoints = [(0.0, 0.0), (2.0, 0.0)]
    assert task.segment_blocked(0.5, 0.8, 2.0, 0.8, grid, 0.34, 1.2)
    linear, angular, _, _, done = task.choose_command(
        0.5, 0.8, 0.0, waypoints, 1, [], grid, 0)
    assert not done
    assert angular < -0.2
    assert linear < task.cruise_mps


def test_commands_stay_within_base_limits_on_a_large_error():
    task = _load_task()
    waypoints = [(0.0, 0.0), (0.0, 3.0)]
    grid = Grid(40, 40)
    linear, angular, _, _, _ = task.choose_command(
        0.0, 0.0, -2.5, waypoints, 1, [], grid, 0)
    assert abs(linear) <= task.max_linear_mps
    assert abs(angular) <= task.max_angular_rps


if __name__ == '__main__':
    test_wrap_and_yaw()
    test_pursues_in_order_and_stops_on_the_last()
    test_does_not_skip_a_missed_waypoint()
    test_turns_toward_a_waypoint_behind_and_stays_inside_limits()
    test_steers_left_around_a_front_obstacle()
    test_inf_beams_are_not_obstacles()
    test_map_block_biases_away_from_the_occupied_side()
    test_commands_stay_within_base_limits_on_a_large_error()
    print('task1c logic checks passed')
