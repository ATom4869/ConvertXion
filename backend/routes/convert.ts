import express, { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const sharpFormats = ["png", "jpeg", "webp", "tiff", "avif"];
const rawFormats = ["dng", "exif"];

router.post("/", upload.single("image"), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { format, quality, width, height, keepAspectRatio, upscale } = req.body;

    if (![...sharpFormats, ...rawFormats].includes(format)) {
      res.status(400).json({ error: "Invalid format" });
      return;
    }

    let convertedImage: Buffer;
    const image = sharp(req.file.buffer);

    // Handle resizing
    let resizeOptions: { width?: number; height?: number; fit?: "cover" | "contain" | "fill" | "inside" | "outside" } = {};
    if (width || height) {
      resizeOptions = {
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        fit: keepAspectRatio === "true" ? "inside" : "fill",
      };
      if (upscale === "false") {
        resizeOptions.fit = "outside"; // Prevents upscaling
      }
      image.resize(resizeOptions);
    }

    // Compression settings
    if (format === "jpeg" || format === "webp" || format === "avif") {
      image.toFormat(format as any, { quality: quality ? parseInt(quality) : 80 },);
    } else if (format === "png") {
      image.png({ compressionLevel: quality ? Math.floor((9 * (100 - parseInt(quality))) / 100) : 6 });
    }

    convertedImage = await image.toBuffer();

    res.setHeader("Content-Type", `image/${format}`);
    res.send(convertedImage);
  } catch (error) {
    console.error("Conversion error:", error);
    res.status(500).json({ error: "Conversion failed" });
  }
});

export default router;
