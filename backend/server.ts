import express from "express";
import cors from "cors";
import convertRoutes from "./routes/convert";
import multer from "multer";

const app = express();
const PORT = 5000;

// Enable CORS (Adjust as needed for security)
app.use(cors({ origin: "*" })); // ✅ Allows all origins (change for production)

// Ensure Express can handle JSON and FormData
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for handling file uploads
const upload = multer({ dest: "uploads/" });

// Use convert routes for processing images
app.use("/", convertRoutes);

// Global Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
