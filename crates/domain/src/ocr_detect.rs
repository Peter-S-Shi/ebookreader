//! DBNet-style text detection postprocessing: turns a per-pixel textness
//! probability map (already sigmoid-activated -- see
//! `tooling/m5-evidence/m5a_det_medium_rust_ort_spike.md` Finding 4) into
//! rotated bounding boxes for candidate text regions.
//!
//! Pure geometry, no ONNX/model dependency -- the tests in this module run
//! in CI without any local model assets. Thresholds match the accepted
//! DBNet parameters recorded in `tooling/m5-evidence/README.md`
//! (thresh=0.2, box_thresh=0.45, unclip_ratio=1.4).
//!
//! `imageproc::geometry::{convex_hull, min_area_rect}` are deliberately not
//! used here: both have confirmed total-order-violation panics on real
//! contour data (see `tooling/m5-evidence/m5b_postprocessing_architecture.md`
//! Finding 1). `min_area_rect` below is a small hand-rolled monotone-chain
//! hull + rotating-calipers implementation using `f64::total_cmp`, which is
//! panic-proof by construction.

use geo::{Coord, LineString, Polygon};
use geo_clipper::{Clipper, EndType, JoinType};
use image::{GrayImage, Luma};
use imageproc::contours::find_contours;

const THRESH: f32 = 0.2;
const BOX_THRESH: f32 = 0.45;
const UNCLIP_RATIO: f64 = 1.4;

/// A detected text region: the unclipped rotated bounding rectangle
/// (4 corner points, not necessarily axis-aligned) and its textness score.
#[derive(Debug, Clone, PartialEq)]
pub struct DetectedBox {
    pub points: [(f64, f64); 4],
    pub score: f32,
}

/// Runs DBNet postprocessing over a raw sigmoid-activated textness map and
/// returns the detected text-region boxes. `prob_map` must have exactly
/// `width * height` elements in row-major order.
pub fn detect_boxes(prob_map: &[f32], width: usize, height: usize) -> Vec<DetectedBox> {
    assert_eq!(prob_map.len(), width * height, "prob_map size must equal width * height");

    let mut bitmap = GrayImage::new(width as u32, height as u32);
    for y in 0..height {
        for x in 0..width {
            if prob_map[y * width + x] > THRESH {
                bitmap.put_pixel(x as u32, y as u32, Luma([255u8]));
            }
        }
    }

    let contours = find_contours::<i32>(&bitmap);
    let mut boxes = Vec::new();

    for contour in contours.iter().take(3000) {
        if contour.points.len() < 3 {
            continue;
        }
        let ip_points: Vec<(f64, f64)> =
            contour.points.iter().map(|p| (p.x as f64, p.y as f64)).collect();
        let pts = min_area_rect(&ip_points);

        if min_side_len(&pts) < 3.0 {
            continue;
        }

        let score = box_score(prob_map, width, height, &pts);
        if score < BOX_THRESH {
            continue;
        }

        let area = polygon_area(&pts);
        let perimeter = polygon_perimeter(&pts);
        if perimeter <= 0.0 {
            continue;
        }
        let distance = area * UNCLIP_RATIO / perimeter;

        let ring = LineString::from(
            pts.iter()
                .map(|&(x, y)| Coord { x, y })
                .chain(std::iter::once(Coord { x: pts[0].0, y: pts[0].1 }))
                .collect::<Vec<_>>(),
        );
        let poly = Polygon::new(ring, vec![]);
        let expanded = poly.offset(distance, JoinType::Round(2.0), EndType::ClosedPolygon, 100.0);

        let Some(expanded_poly) = expanded.0.into_iter().next() else { continue };
        let expanded_pts: Vec<(f64, f64)> =
            expanded_poly.exterior().0.iter().map(|c| (c.x, c.y)).collect();
        if expanded_pts.len() < 3 {
            continue;
        }
        let unclipped_pts = min_area_rect(&expanded_pts);
        if min_side_len(&unclipped_pts) < 5.0 {
            continue;
        }

        boxes.push(DetectedBox { points: unclipped_pts, score });
    }

    boxes
}

fn polygon_area(pts: &[(f64, f64)]) -> f64 {
    let mut a = 0.0;
    for i in 0..pts.len() {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % pts.len()];
        a += x0 * y1 - x1 * y0;
    }
    (a / 2.0).abs()
}

fn polygon_perimeter(pts: &[(f64, f64)]) -> f64 {
    let mut p = 0.0;
    for i in 0..pts.len() {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % pts.len()];
        p += ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt();
    }
    p
}

fn point_in_poly(x: f64, y: f64, pts: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let n = pts.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = pts[i];
        let (xj, yj) = pts[j];
        if ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

fn box_score(pred: &[f32], w: usize, h: usize, pts: &[(f64, f64)]) -> f32 {
    let xmin = pts.iter().map(|p| p.0).fold(f64::INFINITY, f64::min).floor().max(0.0) as usize;
    let xmax = (pts.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max).ceil() as usize).min(w - 1);
    let ymin = pts.iter().map(|p| p.1).fold(f64::INFINITY, f64::min).floor().max(0.0) as usize;
    let ymax = (pts.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max).ceil() as usize).min(h - 1);
    let mut sum = 0.0f64;
    let mut count = 0u32;
    for y in ymin..=ymax {
        for x in xmin..=xmax {
            if point_in_poly(x as f64 + 0.5, y as f64 + 0.5, pts) {
                sum += pred[y * w + x] as f64;
                count += 1;
            }
        }
    }
    if count == 0 { 0.0 } else { (sum / count as f64) as f32 }
}

fn min_side_len(pts: &[(f64, f64)]) -> f64 {
    let mut min_len = f64::INFINITY;
    for i in 0..pts.len() {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % pts.len()];
        let len = ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt();
        if len < min_len {
            min_len = len;
        }
    }
    min_len
}

fn convex_hull(points: &[(f64, f64)]) -> Vec<(f64, f64)> {
    let mut pts = points.to_vec();
    pts.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    pts.dedup();
    if pts.len() < 3 {
        return pts;
    }
    let cross = |o: (f64, f64), a: (f64, f64), b: (f64, f64)| {
        (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
    };
    let mut lower: Vec<(f64, f64)> = Vec::new();
    for &p in &pts {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0.0 {
            lower.pop();
        }
        lower.push(p);
    }
    let mut upper: Vec<(f64, f64)> = Vec::new();
    for &p in pts.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0.0 {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

fn min_area_rect(points: &[(f64, f64)]) -> [(f64, f64); 4] {
    let hull = convex_hull(points);
    if hull.len() < 3 {
        let p = hull.first().copied().unwrap_or((0.0, 0.0));
        return [p, p, p, p];
    }
    let n = hull.len();
    let mut best_area = f64::INFINITY;
    let mut best_rect = [hull[0]; 4];
    for i in 0..n {
        let p0 = hull[i];
        let p1 = hull[(i + 1) % n];
        let dx = p1.0 - p0.0;
        let dy = p1.1 - p0.1;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-9 {
            continue;
        }
        let ux = dx / len;
        let uy = dy / len;
        let vx = -uy;
        let vy = ux;
        let (mut minu, mut maxu, mut minv, mut maxv) =
            (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
        for &p in &hull {
            let u = p.0 * ux + p.1 * uy;
            let v = p.0 * vx + p.1 * vy;
            minu = minu.min(u);
            maxu = maxu.max(u);
            minv = minv.min(v);
            maxv = maxv.max(v);
        }
        let area = (maxu - minu) * (maxv - minv);
        if area < best_area {
            best_area = area;
            let corners_uv = [(minu, minv), (maxu, minv), (maxu, maxv), (minu, maxv)];
            let mut rect = [(0.0, 0.0); 4];
            for (k, &(u, v)) in corners_uv.iter().enumerate() {
                rect[k] = (u * ux + v * vx, u * uy + v * vy);
            }
            best_rect = rect;
        }
    }
    best_rect
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_map(width: usize, height: usize, value: f32) -> Vec<f32> {
        vec![value; width * height]
    }

    fn paint_rect(map: &mut [f32], width: usize, x0: usize, y0: usize, w: usize, h: usize, value: f32) {
        for y in y0..y0 + h {
            for x in x0..x0 + w {
                map[y * width + x] = value;
            }
        }
    }

    #[test]
    fn an_empty_probability_map_detects_no_boxes() {
        let map = flat_map(100, 100, 0.05);
        let boxes = detect_boxes(&map, 100, 100);
        assert!(boxes.is_empty());
    }

    #[test]
    fn a_single_high_probability_rectangle_detects_exactly_one_box() {
        let mut map = flat_map(100, 100, 0.05);
        paint_rect(&mut map, 100, 30, 40, 30, 15, 0.95);
        let boxes = detect_boxes(&map, 100, 100);
        assert_eq!(boxes.len(), 1);
        assert!(boxes[0].score >= BOX_THRESH);
    }

    #[test]
    fn two_well_separated_rectangles_detect_two_boxes() {
        let mut map = flat_map(100, 100, 0.05);
        paint_rect(&mut map, 100, 5, 5, 20, 10, 0.9);
        paint_rect(&mut map, 100, 70, 70, 20, 10, 0.9);
        let boxes = detect_boxes(&map, 100, 100);
        assert_eq!(boxes.len(), 2);
        for b in &boxes {
            assert!(b.score >= BOX_THRESH);
        }
    }

    #[test]
    fn a_region_below_box_thresh_is_not_detected() {
        // Above the binarization THRESH (0.2) but below BOX_THRESH (0.45):
        // should form a contour but be filtered out by the score check.
        let mut map = flat_map(100, 100, 0.05);
        paint_rect(&mut map, 100, 30, 40, 30, 15, 0.3);
        let boxes = detect_boxes(&map, 100, 100);
        assert!(boxes.is_empty());
    }

    #[test]
    fn the_unclipped_box_expands_beyond_the_raw_high_probability_region() {
        let mut map = flat_map(100, 100, 0.05);
        paint_rect(&mut map, 100, 30, 40, 30, 15, 0.95);
        let boxes = detect_boxes(&map, 100, 100);
        assert_eq!(boxes.len(), 1);
        let xs: Vec<f64> = boxes[0].points.iter().map(|p| p.0).collect();
        let ys: Vec<f64> = boxes[0].points.iter().map(|p| p.1).collect();
        let min_x = xs.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let min_y = ys.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        // Unclip (unclip_ratio=1.4) expands outward from the raw 30x15
        // region -- the final box must be strictly larger, not identical.
        assert!(max_x - min_x > 30.0);
        assert!(max_y - min_y > 15.0);
        // But bounded -- unclip should not blow up unreasonably.
        assert!(max_x - min_x < 60.0);
        assert!(max_y - min_y < 45.0);
    }

    #[test]
    fn convex_hull_is_panic_free_on_collinear_points() {
        // Regression case for the imageproc::geometry total-order panic
        // (see tooling/m5-evidence/m5b_postprocessing_architecture.md) --
        // a set of exactly-collinear points used to break convex_hull's
        // sort comparator.
        let pts: Vec<(f64, f64)> =
            (0..20).map(|i| (i as f64, i as f64)).collect();
        let hull = convex_hull(&pts);
        assert!(hull.len() <= 20);
    }

    #[test]
    fn min_area_rect_is_panic_free_on_duplicate_points() {
        let pts = vec![(5.0, 5.0), (5.0, 5.0), (5.0, 5.0)];
        let rect = min_area_rect(&pts);
        assert_eq!(rect, [(5.0, 5.0); 4]);
    }
}
