from pynput import keyboard, mouse
from datetime import datetime
import time
import json
import os



# Locations for all the files being saved.
#
# Anchored to this file, not the working directory: the old "./server/src/logs"
# resolved against wherever the script happened to be launched from, which
# scattered half-full log directories across the repo (./src/logs,
# ./server/backend/src/logs). Matches TRACKING_DIR in config/settings.py.
from pathlib import Path

log_dir = Path(__file__).resolve().parents[1] / "logs" / "tracking"
log_file_keyboard = os.path.join(log_dir, "input_keyboard.jsonl")
log_file_mouse = os.path.join(log_dir, "input_mouse.jsonl")

os.makedirs(log_dir, exist_ok=True)


#writing a log entry to the respective file
def write_log(event_type, data , log_file = log_file_keyboard):
    log_entry = {
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
        "event_type": event_type,
        "data": data
    }
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
        


#on key press and release logging
def on_key_press(key):
    try:
        write_log("Key Press", key.char)
    except AttributeError:
        write_log("Special Key", str(key))

def on_key_release(key):
    if key == keyboard.Key.esc:
        return False 


#mouse click and scroll logging
def on_click(x, y, button, pressed):
    action = "Pressed" if pressed else "Released"
    write_log("Mouse Click", f"{button} at ({x}, {y}) - {action}" , log_file_mouse)

def on_move(x, y):
    write_log("Mouse Move", f"Moved to ({x}, {y})" , log_file_mouse)

def on_scroll(x, y, dx, dy):
    direction = "down" if dy < 0 else "up"
    write_log("Mouse Scroll", f"Scrolled {direction} at ({x}, {y})" , log_file_mouse)


# Setting up listeners for keyboard and mouse
keyboard_listener = keyboard.Listener(on_press=on_key_press, on_release=on_key_release)
mouse_listener = mouse.Listener(on_click=on_click, on_scroll=on_scroll , on_move=on_move)

if __name__ == "__main__":
    try:
        keyboard_listener.start()
        mouse_listener.start()

        print("Tracking input events... Press Ctrl + C to stop.")
        while True:
            time.sleep(1) 
    except KeyboardInterrupt:
        print("\nStopped logging by user.")
        keyboard_listener.stop()
        mouse_listener.stop()
