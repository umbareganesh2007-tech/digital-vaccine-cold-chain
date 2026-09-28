# Strata Cobot Task 1C

`algorithms/scripts/task1c/task1c.py` drives the eBot along `/ebot_path`, through the ten waypoints in order, and stops on the last one. It reads `/odom`, `/scan`, and the latched `/map` rock grid, and publishes `/cmd_vel`. Nav2 and other route-following packages are not used.

## Install into the Task 0 workspace

```bash
mkdir -p ~/ros2_ws/src/algorithms/scripts/task1c
cp algorithms/scripts/task1c/task1c.py ~/ros2_ws/src/algorithms/scripts/task1c/task1c.py
chmod +x ~/ros2_ws/src/algorithms/scripts/task1c/task1c.py
```

In `~/ros2_ws/src/algorithms/setup.py`, add the script path from the package root:

```python
SCRIPTS = [
    'scripts/task1c/task1c.py',
]
```

Rebuild and source:

```bash
cd ~/ros2_ws
colcon build --packages-select algorithms
source install/setup.bash
ros2 pkg executables algorithms
```

`ros2 run` uses the installed copy. Rebuild and source again after every edit.

## Run

Terminal 1, leave it running until the arena finishes:

```bash
ros2 launch eyantra_kepler_colony task1c.launch.py
```

Wait for `[KeplerArenaPlugin] Rock spawn complete.`

Terminal 2:

```bash
source ~/ros2_ws/install/setup.bash
ros2 run algorithms task1c.py
```

Check the latched route:

```bash
ros2 topic echo /ebot_path --once --qos-durability transient_local
```

The first pose is `(0.0025, -0.0025)` and the last is `(5.5025, 1.9975)`. The eight poses between them change every launch, so the node reads `/ebot_path` instead of using a fixed list.
