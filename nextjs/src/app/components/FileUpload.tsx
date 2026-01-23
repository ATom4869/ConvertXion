"use client";
import { useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import ProcessBtn from "./ProcessBtn";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { sha3_256 } from "js-sha3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

// Supported formats from backend
const SUPPORTED_FORMATS = [
  { value: "png", label: "PNG", useCompression: true, useQuality: false },
  { value: "jpg", label: "JPEG", useCompression: false, useQuality: true },
  { value: "webp", label: "WebP", useCompression: false, useQuality: false },
  { value: "avif", label: "AVIF", useCompression: true, useQuality: true },
  { value: "bmp", label: "BMP", useCompression: false, useQuality: false },
  { value: "ppm", label: "PPM", useCompression: false, useQuality: false },
];

// Aspect ratio options
const ASPECT_RATIOS = [
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "2:3", value: 2 / 3 },
  { label: "1:1", value: 1 },
  { label: "16:10", value: 16 / 10 },
  { label: "9:16", value: 9 / 16 },
  { label: "3:4", value: 3 / 4 },
  { label: "3:2", value: 3 / 2 },
  { label: "10:16", value: 10 / 16 },
];

export default function FileUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<string>("png");
  const [theme, setTheme] = useState("cupcake");
  const [quality, setQuality] = useState<number>(80);
  const [avifCompression, setAvifCompression] = useState<number>(7);
  const [compression, setCompression] = useState<number>(2);
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [keepAspectRatio, setKeepAspectRatio] = useState<boolean>(true);
  const [keepOriginalResolution, setKeepOriginalResolution] =
    useState<boolean>(true);
  const [originalWidth, setOriginalWidth] = useState<number | null>(null);
  const [originalHeight, setOriginalHeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [isZipping, setIsZipping] = useState(false);
  const [convertedFile, setConvertedFile] = useState<Blob | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<number | null>(
    null,
  );

  const inputRef = useRef<HTMLInputElement | null>(null);

  const resetValues = () => {
    setFormat("png");
    setQuality(80);
    setCompression(2);
    setAvifCompression(7);
    setWidth("");
    setHeight("");
    setKeepAspectRatio(true);
    setKeepOriginalResolution(true);
    setOriginalWidth(null);
    setOriginalHeight(null);
    setConvertedFile(null);
    setAspectRatio(null);
    setSelectedAspectRatio(null);
  };

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/png": [],
      "image/jpeg": [],
      "image/jpg": [],
      "image/avif": [],
      "image/webp": [],
      "image/bmp": [],
      "image/heic": [],
      "image/exif": [],
      "image/HEIF": [],
      "image/x-portable-pixmap": [],
      "application/octet-stream": [], // ✅ Fallback for unknown file types (helps with `.ppm`)
      ".ppm": [],
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        // Append new files instead of replacing
        setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);

        // If there's no existing preview dimensions, set from first file
        if (!originalWidth && !originalHeight && acceptedFiles.length > 0) {
          const img = new Image();
          img.src = URL.createObjectURL(acceptedFiles[0]);
          img.onload = () => {
            setOriginalWidth(img.width);
            setOriginalHeight(img.height);
            setAspectRatio(img.width / img.height);

            if (keepOriginalResolution) {
              setWidth(img.width);
              setHeight(img.height);
            }
          };
        }
      }
    },
    multiple: true,
  });

  // Add new handler for removing individual files
  const handleRemoveFile = (indexToRemove: number) => {
    setFiles((prevFiles) =>
      prevFiles.filter((_, index) => index !== indexToRemove),
    );
    resetConversion();
  };

  // Add new handler for clearing all files
  const handleClearAllFiles = () => {
    setFiles([]);
    resetConversion();
    resetValues();
  };

  // Update the useEffect for theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "aqua";
    setTheme(savedTheme);
    console.log("FileUpload: Initial theme:", savedTheme); // Debug log

    const handleThemeChange = (e: CustomEvent<string>) => {
      const newTheme = e.detail;
      setTheme(newTheme);
      console.log("FileUpload: Theme changed to:", newTheme); // Debug log
    };

    window.addEventListener("themeChange", handleThemeChange as EventListener);

    return () => {
      window.removeEventListener(
        "themeChange",
        handleThemeChange as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (files.length > 1 && format === "avif") {
      setFormat("png");
      toast.info("AVIF hanya tersedia untuk konversi satu file.");
    }
  }, [files.length, format]);

  const handleFileUpload = () => {
    inputRef.current?.click();
  };

  const handleProcessSingleFile = async (file: File) => {
    setLoading(true);
    setProgress(10);

    try {
      let w = width;
      let h = height;

      if (keepOriginalResolution) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>((resolve) => {
          img.onload = () => {
            w = img.width;
            h = img.height;
            resolve();
          };
        });
      }

      const formData = new FormData();
      formData.append("image", file);
      formData.append("format", format);

      // Set quality or compression
      const currentFormat = SUPPORTED_FORMATS.find((f) => f.value === format);
      if (currentFormat?.useQuality)
        formData.append("quality", quality.toString());
      if (currentFormat?.useCompression)
        formData.append("compression", compression.toString());

      // Kirim ukuran pasti ke backend
      if (w && h) {
        formData.append("width", w.toString());
        formData.append("height", h.toString());
      }

      formData.append("keep_aspect_ratio", keepAspectRatio.toString());

      setProgress(30);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_NODE_ENGINE_URL}/convert`,
        {
          method: "POST",
          body: formData,
          mode: "cors",
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Conversion failed: ${errorText}`);
      }

      setProgress(80);
      const blob = await response.blob();
      setConvertedFile(blob);

      // Auto download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const originalName = file.name.split(".").slice(0, -1).join(".");
      a.download = `${originalName}.${format}`;

      a.click();
      URL.revokeObjectURL(url);

      setProgress(100);
      toast.success("File converted successfully!");
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Error processing file. Please try again.");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessMultipleFiles = async (files: File[]) => {
    if (files.length === 0) {
      toast.error("Please upload at least one file.");
      return;
    }

    setLoading(true);
    setProgress(10); // Starting simulated progress

    const formData = new FormData();

    //  Append all files to formData
    files.forEach((file) => {
      formData.append("file", file);
    });

    //  Append image settings to formData
    formData.append("format", format);
    const currentFormat = SUPPORTED_FORMATS.find((f) => f.value === format);

    if (currentFormat?.useQuality)
      formData.append("quality", quality.toString());
    if (currentFormat?.useCompression)
      formData.append("compression", compression.toString());

    if (!keepOriginalResolution && width && height) {
      const targetWidth = Number(width);
      const targetHeight = Number(height);
      if (!isNaN(targetWidth) && !isNaN(targetHeight)) {
        formData.append("resolution", `${targetWidth},${targetHeight}`);
      } else {
        toast.error("Invalid width or height.");
        setLoading(false);
        return;
      }
    }
    formData.append("keep_aspect_ratio", keepAspectRatio.toString());

    //  Generate session ID
    const userCounter = 1; // Placeholder
    const rawString = `User-${userCounter}`;
    const sessionID = `session-${sha3_256(rawString)}`;
    console.log("Generated Session ID:", sessionID);

    setProgress(20); // Preparing upload

    //  Setup WebSocket for progress
    const socket = new WebSocket(
      `${process.env.NEXT_PUBLIC_RUST_ENGINE_WSS}/ws?session_id=${sessionID}`,
    );

    socket.onopen = () => console.log("WebSocket connected");
    socket.onerror = (err) => console.error("WebSocket error:", err);
    socket.onclose = () => console.log("WebSocket closed");

    //  WebSocket message handler for live progress
    // Update the WebSocket message handler in handleProcessMultipleFiles
    socket.onmessage = (event) => {
      try {
        // Handle both string formats and potential malformed JSON
        let data;
        if (typeof event.data === "string") {
          // Remove any potential invalid characters
          const cleanData = event.data.trim().replace(/\n/g, "");
          try {
            data = JSON.parse(cleanData);
          } catch (e) {
            // If JSON parse fails, try to extract progress from string
            const progressMatch = cleanData.match(/(\d+\.?\d*)%?/);
            if (progressMatch) {
              setProgress(parseFloat(progressMatch[1]));
              return;
            }
            throw e;
          }
        } else {
          data = event.data;
        }

        const progressValue = parseFloat(data.progress) || 0;
        const currentFile = data.filename || "";
        const status = data.status || "";

        // Handle different processing stages
        if (status === "zipping" || currentFile.toLowerCase().includes("zip")) {
          setIsZipping(true);
          // Keep progress between 90-99% during zipping
          setProgress(90 + progressValue * 0.09);
        } else {
          setIsZipping(false);
          // Normal progress up to 90%
          setProgress(Math.min(progressValue * 0.9, 90));
        }

        // Show toast for new files being processed
        if (
          currentFile &&
          !currentFile.includes("started") &&
          !currentFile.includes("zip")
        ) {
          const toastId = `progress-toast-${currentFile}`;
          toast.loading(`Processing: ${currentFile}`, {
            toastId: toastId,
            // Remove autoClose as it doesn't work with loading
          });

          // Automatically update the toast after 5 seconds
          setTimeout(() => {
            toast.update(toastId, {
              render: `Processing: ${currentFile}`,
              type: "info",
              isLoading: false,
              autoClose: 2000,
            });
          }, 5000);
        }

        // Handle completion
        if (progressValue >= 100) {
          setIsZipping(false);
          setProgress(100);

          // First, dismiss all existing toasts
          toast.dismiss();

          // Then show success messages
          files.forEach((file) => {
            toast.success(`Completed: ${file.name}`, {
              position: "top-center",
              autoClose: 2000,
            });
          });

          toast.success("All files processed successfully! 🎉", {
            position: "top-center",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
          setLoading(false);
        }
      } catch (e) {
        console.error("WebSocket message parsing error:", e);
        console.log("Raw message:", event.data);
      }
    };

    // Update the progress bar UI
    {
      loading && (
        <div className="w-full mt-4">
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <progress
              className="progress progress-info h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></progress>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-accent-600 mt-1">
            {isZipping ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-blue-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Creating ZIP file...</span>
              </>
            ) : (
              <span>
                {progress < 10 && "Preparing..."}
                {progress >= 10 &&
                  progress < 90 &&
                  !isZipping &&
                  "Converting files..."}
                {progress === 100 && "Complete!"}
                {` (${Math.round(progress)}%)`}
              </span>
            )}
          </div>
        </div>
      );
    }

    // ✅ Fetch API to start processing
    try {
      setProgress(30); // Uploading start

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_RUST_ENGINE_URL}/convert?session_id=${sessionID}`,
        {
          method: "POST",
          body: formData,
          mode: "cors",
          headers: {
            Origin: window.location.origin,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        // Parse and handle specific error messages
        if (errorText.includes("Maximum")) {
          toast.error("Maximum 3 files allowed for conversion at once");
        } else {
          toast.error(errorText || "Error processing files. Please try again.");
        }
        throw new Error(`Conversion failed: ${errorText}`);
      }

      setProgress(90); // Near finish

      const blob = await response.blob();
      setConvertedFile(blob);
      setProgress(100); // Fully done
      setLoading(false);
      toast.success("Files converted successfully!");
    } catch (error) {
      setProgress(0);
      setLoading(false);
    } finally {
      socket.close(); // ✅ Close socket connection
    }
  };

  const handleProcessFile = async () => {
    if (files.length === 0) {
      toast.error("No files selected!");
      return;
    }

    // Choose API based on number of files
    if (files.length === 1) {
      await handleProcessSingleFile(files[0]);
    } else {
      await handleProcessMultipleFiles(files);
    }
  };

  // Reset the conversion state when values change
  const resetConversion = () => {
    setConvertedFile(null);
    setProgress(0);
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormat(e.target.value);
    resetConversion();
  };

  const handleWidthChange = (value: number | string) => {
    const newWidth = value === "" ? "" : Math.max(1, Number(value));
    setWidth(newWidth);
    resetConversion();

    // Auto-calculate height when aspect ratio is maintained
    if (
      keepAspectRatio &&
      selectedAspectRatio !== null &&
      typeof newWidth === "number"
    ) {
      const calculatedHeight = Math.round(newWidth / selectedAspectRatio);
      setHeight(calculatedHeight);
    }
  };

  const handleHeightChange = (value: number | string) => {
    const newHeight = value === "" ? "" : Math.max(1, Number(value));
    setHeight(newHeight);
    resetConversion();

    // Auto-calculate width when aspect ratio is maintained
    if (
      keepAspectRatio &&
      selectedAspectRatio !== null &&
      typeof newHeight === "number"
    ) {
      const calculatedWidth = Math.round(newHeight * selectedAspectRatio);
      setWidth(calculatedWidth);
    }
  };

  const handleCompressionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompression(Number(e.target.value));
    resetConversion();
  };

  const handleAvifCompressionChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setAvifCompression(Number(e.target.value));
    resetConversion();
  };

  const handleQualityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuality(Number(e.target.value));
    resetConversion();
  };

  const handleResolutionChange = (preset: string) => {
    resetConversion();
    const resolutions: { [key: string]: [number, number] } = {
      "4K": [3840, 2160],
      "1440p": [2560, 1440],
      "1080p": [1920, 1080],
      "720p": [1280, 720],
      "480p": [854, 480],
    };
    if (preset in resolutions) {
      setWidth(resolutions[preset][0]);
      setHeight(resolutions[preset][1]);
    }
  };

  const handleAspectRatioChange = (ratio: number) => {
    setSelectedAspectRatio(ratio);
    resetConversion();

    // Recalculate height or width based on the new aspect ratio
    if (keepAspectRatio) {
      if (width && typeof width === "number") {
        const calculatedHeight = Math.round(width / ratio);
        setHeight(calculatedHeight);
      } else if (height && typeof height === "number") {
        const calculatedWidth = Math.round(height * ratio);
        setWidth(calculatedWidth);
      }
    }
  };

  const handleDownload = () => {
    if (!convertedFile || files.length === 0) return;

    // Create appropriate filename based on number of files
    let fileName;

    if (files.length === 1) {
      // Single file - use original naming convention
      const originalFileName = files[0].name.replace(/\.[^.]+$/, ""); // Remove original extension
      let resolutionLabel =
        keepOriginalResolution || (!width && !height)
          ? "original-res"
          : `${width}x${height}`;
      fileName = `${originalFileName}-converted-${resolutionLabel}.${format}`;
    } else {
      // Multiple files - create a zip filename
      fileName = `converted-images-${format}.zip`;
    }

    const url = URL.createObjectURL(convertedFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const availableFormats = SUPPORTED_FORMATS.filter((f) => {
    // Sembunyikan AVIF kalau file lebih dari 1
    if (files.length > 1 && f.value === "avif") return false;
    // Sembunyikan PPM karena cuma buat input (sesuai request Mas Arson)
    if (f.value === "ppm") return false;
    return true;
  });

  // currentFormat tetap pakai SUPPORTED_FORMATS supaya data label/useQuality gak ilang
  const currentFormat =
    SUPPORTED_FORMATS.find((f) => f.value === format) || SUPPORTED_FORMATS[0];

  return (
    <div className="flex flex-col w-full items-center min-h-screen bg-base-100">
      <main className="flex flex-col items-center flex-grow p-4">
        <div
          {...getRootProps({
            onClick: (event) => event.stopPropagation(),
          })}
          className="file-inpu flex flex-col items-center justify-center w-250 h-96 border-2 border-dashed border-base-300 rounded-lg bg-base-200 p-2 mt-10 cursor-pointer"
        >
          <input
            {...getInputProps()}
            type="file"
            ref={inputRef}
            style={{ display: "none" }}
            className="file-input file-input-accent"
          />
          <br />
          <p className="text-base-content">Drag & drop files here</p>
          <p className="text-base-content/70 text-sm mt-1">
            Support for single or multiple files
          </p>
          <button
            className="btn btn-primary mt-4 px-4 py-2 text-primary-content rounded"
            onClick={handleFileUpload}
            type="button"
          >
            Add Files
          </button>
        </div>

        {files.length > 0 && (
          <div className="mt-4 text-center w-full max-w-2xl">
            <p className="text-base-content font-medium">
              {files.length === 1
                ? `Selected File: ${files[0].name}`
                : `Selected Files: ${files.length} files`}
            </p>

            <div className="mt-2">
              <ul className="text-left max-h-40 overflow-y-auto text-base-content/80">
                {files.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="ml-2 px-2 py-1 text-error hover:text-error-content cursor-pointer transition-colors"
                      title="Remove file"
                    >
                      <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <br />
              <div className="mt-3 flex justify-between items-center">
                <p className="text-base-content/90 font-medium">
                  {files.length > 1 &&
                    "Multiple files will be converted and delivered as a zip file"}
                </p>
                <button
                  onClick={handleClearAllFiles}
                  className="px-3 py-1 text-sm text-error hover:bg-error hover:text-error-content border border-error cursor-pointer rounded transition-colors"
                >
                  Clear All Files
                </button>
              </div>
            </div>

            <div className="mt-6 bg-base-200 p-4 rounded-lg border border-base-300">
              <h3 className="text-lg font-medium text-base-content mb-3">
                Conversion Settings
              </h3>

              <div className="mb-4">
                <label className="block text-base-content font-medium mb-2">
                  Output Format
                </label>
                <select
                  className="select select-bordered w-full p-2 border rounded text-base-content bg-base-100 rounded-lg"
                  value={format}
                  onChange={handleFormatChange}
                >
                  {availableFormats.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display quality slider for formats that use it */}
              {/* Quality slider for JPG and AVIF */}
              {["jpg", "avif"].includes(currentFormat.value) && (
                <div className="mb-4">
                  <label className="block text-base-content font-medium mb-2">
                    Quality: {quality}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="100"
                    step="5"
                    value={quality}
                    onChange={handleQualityChange}
                    className="range range-xs range-primary w-full"
                  />
                  <div className="flex justify-between text-xs text-accent-500">
                    <span>Low Quality (50)</span>
                    <span>High Quality (100)</span>
                  </div>
                </div>
              )}

              {/* AVIF Speed Control */}
              {currentFormat.value === "avif" && (
                <div className="mb-4">
                  <label className="block text-base-content font-medium mb-2">
                    Speed Level: {avifCompression}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="10"
                    step="1"
                    value={avifCompression}
                    onChange={handleAvifCompressionChange}
                    className="range range-xs range-primary w-full"
                  />
                  <div className="flex justify-between text-xs text-accent-500">
                    <span>Best Compression (5)</span>
                    <span>Lower Compression (10)</span>
                  </div>
                </div>
              )}

              {/* JPG Compression */}
              {currentFormat.value === "jpg" && (
                <div className="mb-4">
                  <label className="block text-base-content font-medium mb-2">
                    Compression Level: {compression}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={compression}
                    onChange={handleCompressionChange}
                    className="range range-xs range-primary w-full"
                  />
                  <div className="flex justify-between text-xs text-accent-500">
                    <span>Maximum Compression (1)</span>
                    <span>Fast Compression (3)</span>
                  </div>
                </div>
              )}

              {/* PNG Compression */}
              {currentFormat.value === "png" && (
                <div className="mb-4">
                  <label className="block text-base-content font-medium mb-2">
                    Compression Level: {compression}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={compression}
                    onChange={handleCompressionChange}
                    className="range range-xs range-primary w-full"
                  />
                  <div className="flex justify-between text-xs text-accent-500">
                    <span>Fast (1)</span>
                    <span>Best Compression (3)</span>
                  </div>
                </div>
              )}

              {/* Resolution Options */}
              <div className="mb-4">
                <label className="flex items-center cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={keepOriginalResolution}
                    onChange={() => {
                      setKeepOriginalResolution(!keepOriginalResolution);
                      resetConversion();
                    }}
                    className="toggle toggle-accent mr-2"
                  />
                  <span className="text-accent-700 font-medium">
                    Keep Original Resolution
                  </span>
                </label>

                {!keepOriginalResolution && (
                  <div className="pl-6 pt-2">
                    <div className="mb-3">
                      <label className="block text-accent-700 mb-1">
                        Resolution Presets
                      </label>
                      <select
                        className="select select-accent w-full p-2 border rounded text-black bg-accent rounded-lg"
                        onChange={(e) => {
                          handleResolutionChange(e.target.value);
                        }}
                      >
                        <option value="">Custom</option>
                        <option value="4K">4K (3840×2160)</option>
                        <option value="1440p">1440p (2560×1440)</option>
                        <option value="1080p">1080p (1920×1080)</option>
                        <option value="720p">720p (1280×720)</option>
                        <option value="480p">480p (854×480)</option>
                      </select>
                    </div>

                    <div className="mb-3">
                      <label className="flex items-center cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={keepAspectRatio}
                          onChange={() => {
                            setKeepAspectRatio(!keepAspectRatio);
                            resetConversion();
                          }}
                          className="toggle toggle-accent mr-2"
                        />
                        <span className="text-accent-700">
                          Maintain Aspect Ratio
                        </span>
                      </label>

                      {keepAspectRatio && (
                        <div className="mb-3">
                          <label className="block text-neutral mb-1">
                            Aspect Ratio
                          </label>
                          <div className="flex gap-2">
                            {ASPECT_RATIOS.map((ratio) => (
                              <button
                                key={ratio.label}
                                type="button"
                                className={`btn px-3 py-1 border hover:btn-accent-focus rounded ${
                                  selectedAspectRatio === ratio.value
                                    ? "btn-secondary text-neutral"
                                    : "btn-primary text-neutral"
                                }`}
                                onClick={() =>
                                  handleAspectRatioChange(ratio.value)
                                }
                              >
                                {ratio.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            className={`block text-sm ${theme === "cupcake" ? "text-neutral" : "text-primary"} mb-1`}
                          >
                            Width (px)
                          </label>
                          <input
                            type="number"
                            placeholder="Width"
                            className={`input input-secondary px-2 ${theme === "cupcake" ? "text-neutral" : "text-primary"} border rounded-xl w-2/3`}
                            value={width}
                            min="0"
                            onChange={(e) => handleWidthChange(e.target.value)}
                          />
                        </div>
                        <div>
                          <label
                            className={`block text-sm ${theme === "cupcake" ? "text-neutral" : "text-primary"} mb-1`}
                          >
                            Height (px)
                          </label>
                          <input
                            type="number"
                            placeholder="Height"
                            className={`input input-secondary p-2 ${theme === "cupcake" ? "text-neutral" : "text-primary"} border rounded-xl w-2/3`}
                            value={height}
                            min="0"
                            onChange={(e) => handleHeightChange(e.target.value)}
                          />
                        </div>
                      </div>

                      {originalWidth && originalHeight && (
                        <p className="text-xs text-neutral-500 mt-1">
                          Original: {originalWidth} × {originalHeight}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6">
              {/* Process button */}
              {!loading && !convertedFile && (
                <ProcessBtn
                  text={files.length === 1 ? "Convert File" : "Convert Files"}
                  onClick={handleProcessFile}
                  disabled={loading}
                  className="font-medium text-accent shadow-sm"
                />
              )}

              {/* Progress bar */}
              {loading && (
                <div className="w-full mt-4">
                  <div className="w-full">
                    <progress
                      className="progress progress-primary w-full"
                      value={progress}
                      max="100"
                    ></progress>
                  </div>
                  <p className="text-sm text-accent-600 mt-1">
                    Processing... {progress}%
                  </p>
                </div>
              )}

              {/* Download button */}
              {progress >= 100 && convertedFile && (
                <ProcessBtn
                  text={
                    files.length === 1
                      ? "Download Converted File"
                      : "Download Converted Files (ZIP)"
                  }
                  onClick={handleDownload}
                  className="bg-green-600 hover:bg-green-700 px-6 py-2 font-medium shadow-sm"
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
