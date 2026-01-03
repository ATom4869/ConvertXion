import express from "express";
import multer from "multer";
import sharp from "sharp";
import Jimp from "jimp";
import path from "path";

const router = express.Router();

// Multer Storage Configuration
const storage = multer.memoryStorage(); // pakai memoryStorage, ga usah disk
const upload = multer({ storage });

// Supported formats
const SUPPORTED_FORMATS = ["png", "jpg", "webp", "avif", "bmp", "ppm"];

// Process image conversion
router.post(
  "/convert",
  upload.single("image"),
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      console.log("🔥 Received file:", req.file);
      console.log("🔥 Received body:", req.body);

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded." });
        return;
      }

      const { format, quality, compression, width, height, keep_aspect_ratio } =
        req.body;
      const ext = path.extname(req.file.originalname).toLowerCase();
      const originalName = path.parse(req.file.originalname).name; // hapus extension lama
      const outputFileName = `${originalName}.${format}`;
      const targetWidth = parseInt(width);
      const targetHeight = parseInt(height);
      const upscale = targetWidth > 0 && targetHeight > 0;

      if (!SUPPORTED_FORMATS.includes(format)) {
        res.status(400).json({ error: `Unsupported format: ${format}` });
        return;
      }

      let outputBuffer: Buffer;

      // Handle PPM with Jimp
      if (ext === ".ppm") {
        const jimpImage = await Jimp.read(req.file.buffer);
        jimpImage.resize(
          targetWidth,
          targetHeight,
          Jimp.RESIZE_NEAREST_NEIGHBOR
        );
        outputBuffer = await jimpImage.getBufferAsync(Jimp.MIME_PNG); // PPM → PNG
      } else {
        // Handle all other formats with Sharp
        let sharpImage = sharp(req.file.buffer);

        if (keep_aspect_ratio === "true") {
          sharpImage = sharpImage.resize(targetWidth, targetHeight, {
            fit: "inside",
            withoutEnlargement: !upscale,
          });
        } else {
          sharpImage = sharpImage.resize(targetWidth, targetHeight, {
            fit: "fill",
          });
        }

        if (format === "jpg") {
          const q = parseInt(quality) || 80;
          const comp = parseInt(compression) || 2;

          let progressive = true;
          let mappedQuality = q;
          let chroma: "4:2:0" | "4:4:4" = "4:2:0";

          switch (comp) {
            case 1:
              chroma = "4:2:0";
              mappedQuality = Math.min(q, 70);
              progressive = true;
              break;
            case 2:
              chroma = "4:2:0";
              mappedQuality = Math.min(q, 85);
              progressive = true;
              break;
            case 3:
              chroma = "4:4:4";
              mappedQuality = Math.min(q, 95);
              progressive = false;
              break;
            default:
              chroma = "4:2:0";
              mappedQuality = 85;
              progressive = true;
              break;
          }

          sharpImage = sharpImage.jpeg({
            quality: mappedQuality,
            progressive,
            chromaSubsampling: chroma,
          });
        } else if (format === "png") {
          const comp = parseInt(compression);
          let compressionLevel;
          let qualityLevel;
          switch (comp) {
            case 1:
              compressionLevel = 2;
              qualityLevel = 70;
              break;
            case 2:
              compressionLevel = 5;
              qualityLevel = 60;
              break;
            case 3:
              compressionLevel = 9;
              qualityLevel = 50;
              break;
            default:
              compressionLevel = 5;
              qualityLevel = 60;
              break;
          }
          console.log("🔧 PNG Compression Level:", compressionLevel);
          console.log("🔧 PNG Quality:", { qualityLevel });
          sharpImage = sharpImage.png({
            compressionLevel,
            quality: qualityLevel,
            adaptiveFiltering: true,
          });
        } else if (format === "webp") {
          sharpImage = sharpImage.webp({ quality: parseInt(quality) || 80 });
        } else if (format === "avif") {
          sharpImage = sharpImage.avif({ quality: parseInt(quality) || 80 });
        }

        outputBuffer = await sharpImage.toBuffer();
      }

      // Kirim langsung ke frontend
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputFileName}"`
      );
      res.setHeader("Content-Type", `image/${format}`);
      res.send(outputBuffer);
    } catch (error) {
      console.error("❌ Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  }
);

export default router;
