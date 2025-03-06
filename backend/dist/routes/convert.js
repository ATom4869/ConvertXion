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
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const sharpFormats = ["png", "jpeg", "webp", "tiff", "avif"];
const rawFormats = ["dng", "exif"];
router.post("/", upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        let convertedImage;
        const image = (0, sharp_1.default)(req.file.buffer);
        // Handle resizing
        let resizeOptions = {};
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
            image.toFormat(format, { quality: quality ? parseInt(quality) : 80 });
        }
        else if (format === "png") {
            image.png({ compressionLevel: quality ? Math.floor((9 * (100 - parseInt(quality))) / 100) : 6 });
        }
        convertedImage = yield image.toBuffer();
        res.setHeader("Content-Type", `image/${format}`);
        res.send(convertedImage);
    }
    catch (error) {
        console.error("Conversion error:", error);
        res.status(500).json({ error: "Conversion failed" });
    }
}));
exports.default = router;
