import { ImageResponse } from "next/og";

/** Apple touch icon — navy → teal gradient + “R” (REIMED brand). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a4d8c 0%, #2eb8c0 100%)",
          borderRadius: 40,
          fontSize: 112,
          fontWeight: 800,
          color: "white",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
