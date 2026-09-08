// M0 Corrective Evidence - M0-F: real Rust `ort` ONNX inference against the
// same PP-OCRv4 detection model RapidOCR (Python) used in the first M0 pass.
// This proves production-path feasibility (Rust ONNX Runtime binding, not a
// shipped Python interpreter), not a full ported OCR pipeline.

use image::GenericImageView;
use ndarray::Array4;
use ort::session::Session;
use ort::value::Tensor;
use std::env;
use std::time::Instant;

fn main() -> ort::Result<()> {
    let args: Vec<String> = env::args().collect();
    let dylib_path = &args[1];
    let model_path = &args[2];
    let image_path = &args[3];

    ort::init_from(dylib_path).expect("failed to load onnxruntime dylib").commit();

    let mut session = Session::builder()?.commit_from_file(model_path)?;

    let img = image::open(image_path).expect("failed to open image");
    let (w0, h0) = img.dimensions();
    // PP-OCR det preprocessing: resize so both dims are multiples of 32, normalize.
    let target_w = ((w0 as f32 / 32.0).round() as u32 * 32).max(32);
    let target_h = ((h0 as f32 / 32.0).round() as u32 * 32).max(32);
    let resized = img.resize_exact(target_w, target_h, image::imageops::FilterType::Triangle);
    let rgb = resized.to_rgb8();

    let mean = [0.485f32, 0.456, 0.406];
    let std = [0.229f32, 0.224, 0.225];

    let mut arr = Array4::<f32>::zeros((1, 3, target_h as usize, target_w as usize));
    for y in 0..target_h {
        for x in 0..target_w {
            let px = rgb.get_pixel(x, y);
            for c in 0..3 {
                let v = px[c] as f32 / 255.0;
                arr[[0, c, y as usize, x as usize]] = (v - mean[c]) / std[c];
            }
        }
    }

    let shape_vec: Vec<i64> = arr.shape().iter().map(|&d| d as i64).collect();
    let data_vec: Vec<f32> = arr.into_raw_vec_and_offset().0;
    let input = Tensor::from_array((shape_vec, data_vec)).unwrap();

    let t0 = Instant::now();
    let outputs = session.run(ort::inputs!["x" => input])?;
    let elapsed = t0.elapsed();

    let (out_shape, data) = outputs["sigmoid_0.tmp_0"].try_extract_tensor::<f32>()?;
    let shape = out_shape.to_vec();
    let min = data.iter().cloned().fold(f32::INFINITY, f32::min);
    let max = data.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let mean_v: f32 = data.iter().sum::<f32>() / data.len() as f32;
    let above_thresh = data.iter().filter(|&&v| v > 0.3).count();

    println!("RUST ORT INFERENCE RESULT");
    println!("model: {}", model_path);
    println!("image: {} ({}x{} -> resized {}x{})", image_path, w0, h0, target_w, target_h);
    println!("output_name: sigmoid_0.tmp_0");
    println!("output_shape: {:?}", shape);
    println!("output_min: {:.6}", min);
    println!("output_max: {:.6}", max);
    println!("output_mean: {:.6}", mean_v);
    println!("pixels_above_0.3_textness: {} / {}", above_thresh, data.len());
    println!("inference_wall_time_ms: {:.2}", elapsed.as_secs_f64() * 1000.0);

    Ok(())
}
