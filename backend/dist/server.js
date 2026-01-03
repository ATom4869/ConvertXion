"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const convert_1 = __importDefault(require("./routes/convert"));
const multer_1 = __importDefault(require("multer"));
const app = (0, express_1.default)();
const PORT = 5000;
// Enable CORS (Adjust as needed for security)
app.use((0, cors_1.default)({ origin: "*" })); // ✅ Allows all origins (change for production)
// Ensure Express can handle JSON and FormData
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Multer setup for handling file uploads
const upload = (0, multer_1.default)({ dest: "uploads/" });
// Use convert routes for processing images
app.use("/", convert_1.default);
// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
});
// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
