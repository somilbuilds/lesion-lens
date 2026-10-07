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
        self.malignant_group = ["mel", "bcc"]
        self.precancerous_group = ["akiec"]
        self.benign_group = ["nv", "bkl", "df", "vasc"]
        
        self.tta_views = 4 # Original, hflip, vflip, both
        
        # Thresholds
        self.uncertainty_prob_threshold = 0.5
        self.uncertainty_margin_threshold = 0.15
        self.uncertainty_view_agreement_threshold = 0.75

        # Image limits
        self.max_image_size_mb = 10
        self.min_short_side_px = 100

config = Config()
