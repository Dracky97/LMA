import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" style={{ backgroundColor: '#0a0a0a' }}>
      <Head />
      <body className="antialiased" style={{ backgroundColor: '#0a0a0a', margin: 0 }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
