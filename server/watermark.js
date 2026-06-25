/**
 * Watermark module.
 *
 * Adds a semi-transparent watermark to generated images for free users.
 * Paid users (with active subscription) get clean images.
 */

/**
 * Determine if a user should receive watermarked images.
 *
 * @param {object|null} user - User object from DB
 * @returns {boolean} - true if watermark should be applied
 */
export function shouldApplyWatermark(user) {
  // No user (no-DB mode) → no watermark (local dev)
  if (!user) return false;

  // Admin → never watermark
  if (user.role === "admin") return false;

  // Active subscription → no watermark
  if (user.subscription_plan && user.subscription_plan !== "free") {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires > new Date()) return false;
    }
  }

  // Free user → watermark
  return true;
}

/**
 * Add watermark text to a base64 image using Canvas.
 *
 * This is a lightweight implementation using pure Node.js canvas.
 * For production, consider using sharp or a dedicated image processing library.
 *
 * @param {string} base64Image - Base64 encoded image (with or without data URI prefix)
 * @param {string} text - Watermark text
 * @returns {Promise<string>} - Base64 encoded watermarked image (with data URI prefix)
 */
export async function addWatermark(base64Image, text = "封面之王 kingofcover.com") {
  // Dynamic import sharp (needs to be installed)
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    // If sharp is not available, return original image
    console.warn("[Watermark] sharp not available, skipping watermark.");
    return base64Image;
  }

  // Strip data URI prefix if present
  const prefix = base64Image.match(/^data:image\/\w+;base64,/);
  const raw = prefix ? base64Image.slice(prefix[0].length) : base64Image;
  const buffer = Buffer.from(raw, "base64");

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1024;

    // Create SVG watermark overlay
    const fontSize = Math.max(16, Math.floor(width * 0.03));
    const svgWatermark = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .watermark {
            font-family: Arial, sans-serif;
            font-size: ${fontSize}px;
            fill: rgba(255, 255, 255, 0.4);
            text-anchor: end;
          }
        </style>
        <text x="${width - 20}" y="${height - 20}" class="watermark">${text}</text>
      </svg>
    `;

    const watermarked = await sharp(buffer)
      .composite([
        {
          input: Buffer.from(svgWatermark),
          gravity: "southeast",
        },
      ])
      .png()
      .toBuffer();

    const resultBase64 = watermarked.toString("base64");
    return `data:image/png;base64,${resultBase64}`;
  } catch (err) {
    console.error("[Watermark] Error applying watermark:", err.message);
    return base64Image;
  }
}

/**
 * Process an array of generated images, applying watermark if needed.
 *
 * @param {string[]} images - Array of base64 images
 * @param {object|null} user - User object
 * @returns {Promise<string[]>} - Processed images
 */
export async function processImages(images, user) {
  if (!shouldApplyWatermark(user)) {
    return images;
  }

  // Apply watermark to all images
  const processed = await Promise.all(
    images.map((img) => addWatermark(img))
  );
  return processed;
}
