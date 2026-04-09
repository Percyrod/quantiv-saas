import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quantiv — Supply Chain Simulator',
  description: 'Comparador de modelos de reposición: ROP, ROP+Forecast, ROP Anticipado y DDMRP. Simulación de 52 semanas con lógica estadística real.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
