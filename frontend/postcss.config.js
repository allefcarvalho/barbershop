import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // Caminho explícito: o Tailwind procura a config na pasta onde o processo foi iniciado, não na do frontend.
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
};
