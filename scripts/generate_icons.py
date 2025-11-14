#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#   "pillow>=10.0.0",
# ]
# ///

from PIL import Image, ImageDraw
import os

def create_icon(size):
    # Create image with dark background
    img = Image.new('RGB', (size, size), color='#1a1d24')
    draw = ImageDraw.Draw(img)
    
    # Calculate positions - visually centered
    center_x = size / 2
    center_y = size / 2
    radius = size * 0.22
    handle_length = size * 0.18
    
    # Draw magnifying glass - centered
    # Circle center (slightly offset for visual balance)
    circle_x = center_x - radius * 0.15
    circle_y = center_y - radius * 0.15
    bbox = [
        circle_x - radius,
        circle_y - radius,
        circle_x + radius,
        circle_y + radius
    ]
    
    # Draw circle outline
    line_width = max(3, int(size * 0.06))
    draw.ellipse(bbox, outline='#5b9bd5', width=line_width)
    
    # Draw handle - extending from circle
    handle_start_x = circle_x + radius * 0.7
    handle_start_y = circle_y + radius * 0.7
    handle_end_x = handle_start_x + handle_length
    handle_end_y = handle_start_y + handle_length
    
    draw.line(
        [(handle_start_x, handle_start_y), (handle_end_x, handle_end_y)],
        fill='#5b9bd5',
        width=line_width
    )
    
    return img

def main():
    # Create public directory if it doesn't exist
    public_dir = 'public'
    if not os.path.exists(public_dir):
        os.makedirs(public_dir)
    
    sizes = [192, 512]
    
    for size in sizes:
        try:
            icon = create_icon(size)
            icon_path = os.path.join(public_dir, f'icon-{size}.png')
            icon.save(icon_path, 'PNG')
            print(f'Created {icon_path}')
        except Exception as e:
            print(f'Error creating icon-{size}.png: {e}')

if __name__ == '__main__':
    main()
