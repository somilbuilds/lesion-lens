import cv2
import numpy as np

class Segmenter:
    def segment(self, image: np.ndarray, gradcam_heatmap: np.ndarray):
        """
        image: Original RGB image array (H, W, 3)
        gradcam_heatmap: Grad-CAM heatmap array (H, W) values in [0, 1]
        Returns: list of normalized (x, y) points [[x1, y1], [x2, y2], ...]
                 where x and y are typically divided by W and H respectively.
        """
        raise NotImplementedError

class DefaultSegmenter(Segmenter):
    def segment(self, image: np.ndarray, gradcam_heatmap: np.ndarray):
        # Scale heatmap to 0-255 uint8
        heatmap_uint8 = np.uint8(255 * gradcam_heatmap)
        
        # Threshold the Grad-CAM map
        # Take Otsu's threshold
        _, thresh = cv2.threshold(heatmap_uint8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return []
            
        # Take the largest connected region
        largest_contour = max(contours, key=cv2.contourArea)
        
        # We can try to refine with GrabCut but to keep it fast and simple, 
        # let's just return a nice approximated polygon from the largest contour.
        epsilon = 0.01 * cv2.arcLength(largest_contour, True)
        approx = cv2.approxPolyDP(largest_contour, epsilon, True)
        
        normalized_polygon = []
        h, w = image.shape[:2]
        for point in approx:
            x, y = point[0]
            normalized_polygon.append([float(x) / w, float(y) / h])
            
        return normalized_polygon
