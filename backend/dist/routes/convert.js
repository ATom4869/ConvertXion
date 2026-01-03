"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const jimp_1 = __importDefault(require("jimp"));
const path_1 = __importDefault(require("path"));
const router = express_1.default.Router();
// Multer Storage Configuration
const storage = multer_1.default.memoryStorage(); // pakai memoryStorage, ga usah disk
const upload = (0, multer_1.default)({ storage });
// Supported formats
const SUPPORTED_FORMATS = ["png", "jpg", "webp", "avif", "bmp", "ppm"];
// Process image conversion
router.post("/convert", upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("🔥 Received file:", req.file);
        console.log("🔥 Received body:", req.body);
        if (!req.file) {
            res.status(400).json({ error: "No file uploaded." });
            return;
        }
        const { format, quality, compression, width, height, keep_aspect_ratio } = req.body;
        const ext = path_1.default.extname(req.file.originalname).toLowerCase();
        const originalName = path_1.default.parse(req.file.originalname).name; // hapus extension lama
        const outputFileName = `${originalName}.${format}`;
        const targetWidth = parseInt(width);
        const targetHeight = parseInt(height);
        const upscale = targetWidth > 0 && targetHeight > 0;
        if (!SUPPORTED_FORMATS.includes(format)) {
            res.status(400).json({ error: `Unsupported format: ${format}` });
            return;
        }
        let outputBuffer;
        // Handle PPM with Jimp
        if (ext === ".ppm") {
            const jimpImage = yield jimp_1.default.read(req.file.buffer);
            jimpImage.resize(targetWidth, targetHeight, jimp_1.default.RESIZE_NEAREST_NEIGHBOR);
            outputBuffer = yield jimpImage.getBufferAsync(jimp_1.default.MIME_PNG); // PPM → PNG
        }
        else {
            // Handle all other formats with Sharp
            let sharpImage = (0, sharp_1.default)(req.file.buffer);
            if (keep_aspect_ratio === "true") {
                sharpImage = sharpImage.resize(targetWidth, targetHeight, {
                    fit: "inside",
                    withoutEnlargement: !upscale,
                });
            }
            else {
                sharpImage = sharpImage.resize(targetWidth, targetHeight, {
                    fit: "fill",
                });
            }
            if (format === "jpg") {
                const q = parseInt(quality) || 80;
                const comp = parseInt(compression) || 2;
                let progressive = true;
                let mappedQuality = q;
                let chroma = "4:2:0";
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
            }
            else if (format === "png") {
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
            }
            else if (format === "webp") {
                sharpImage = sharpImage.webp({ quality: parseInt(quality) || 80 });
            }
            else if (format === "avif") {
                sharpImage = sharpImage.avif({ quality: parseInt(quality) || 80 });
            }
            outputBuffer = yield sharpImage.toBuffer();
        }
        // Kirim langsung ke frontend
        res.setHeader("Content-Disposition", `attachment; filename="${outputFileName}"`);
        res.setHeader("Content-Type", `image/${format}`);
        res.send(outputBuffer);
    }
    catch (error) {
        console.error("❌ Error processing file:", error);
        res.status(500).json({ error: "Failed to process file" });
    }
}));
exports.default = router;
