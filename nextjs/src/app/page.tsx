"use client";

import React from "react";
import FileUpload from "./components/FileUpload";
import { Analytics } from "@vercel/analytics/next";

const page = () => {
  return (
    <div className="mx-auto w-full">
      <Analytics />
      <FileUpload />
    </div>
  );
};

export default page;
