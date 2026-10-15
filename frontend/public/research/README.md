# Research comparison charts

Put the exported comparison figures in this folder using these exact names:

- `model-comparison.png` — bar chart comparing Small CNN, ResNet18 transfer learning, and EfficientNet-B0.
- `confusion-matrices.png` — confusion matrices for the three models, preferably with identical class order.
- `class-metrics.png` — optional per-class precision/recall/F1 comparison.

The Research tab in the app loads these assets from `/research/<filename>`. If an image is not present yet, the app displays a placeholder message.

Only publish metrics calculated from the same documented evaluation split. Clearly label dataset, sample count, class order, and whether values are percentages or counts.
