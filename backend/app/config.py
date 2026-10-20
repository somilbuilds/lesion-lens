import os
import json

class Config:
    def __init__(self):
        # Allow loading optional temperature.json
        temp_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "temperature.json")
        self.temperature = 1.0
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f:
                    data = json.load(f)
                    self.temperature = data.get("temperature", 1.0)
            except:
                pass
        
        self.classes = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
        self.tta_views = 4 # Original, hflip, vflip, both

        # Image limits
        self.max_image_size_mb = 10
        self.max_image_pixels = 20_000_000
        self.min_short_side_px = 100

config = Config()
