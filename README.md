# 📚 Oz VIRTUAL LIBRARY

> **Biblioteca Virtual Científica Universitária** focada em Biologia, Saúde e Medicina.  
> Uma plataforma moderna para estudantes, docentes e investigadores universitários, desenhada para facilitar o acesso rápido a manuais, resumos, artigos e ferramentas de apoio ao estudo.

---

## ✨ Funcionalidades Principais

- 📖 **Acervo Académico Organizado:** Catálogo classificado por áreas científicas e cadeiras curriculares (Anatomia, Bioquímica, Fisiologia, Genética, etc.).
- 📑 **Leitor PDF Integrado:** Leitor avançado com modo noturno, índice, pesquisa, rotação de páginas, marcadores e visualização em ecrã inteiro.
- 📱 **Progressive Web App (PWA):** Instalação direta no telemóvel (Android/iOS) e computador (Chrome/Edge/Desktop) com suporte para leitura e cache offline.
- 🤖 **Assistente Científico com IA:** Suporte inteligente baseado no Google Gemini para síntese de matérias, tira-dúvidas e guias de revisão médica.
- 🪪 **Cartão de Estudante Digital:** Geração e emissão de cartão com código de barras, fotografia e dados académicos oficiais.
- ⏱️ **Sala de Estudo & Pomodoro:** Ambiente de foco com método Pomodoro, lista de metas e histórico de sessões.
- 🔒 **Sincronização em Tempo Real:** Base de dados com Cloud Firestore e autenticação segura com controlo de acessos (Estudante / Administrador).
- 🌐 **Internacionalização (i18n):** Suporte nativo para múltiplos idiomas (Português, Inglês, Francês, Espanhol).
- 🌓 **Temas:** Modo Claro, Escuro e Sincronização com o Sistema.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **Estilos:** [Tailwind CSS](https://tailwindcss.com/)
- **Ícones:** [Lucide React](https://lucide.dev/)
- **Backend / Proxy:** [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- **Base de Dados & Auth:** [Firebase Firestore](https://firebase.google.com/products/firestore) & Firebase Authentication
- **PWA:** [Vite PWA Plugin](https://vite-pwa-org.netlify.app/) (Workbox Service Worker + Web Manifest)
- **IA:** [Google Gen AI SDK (@google/genai)](https://www.npmjs.com/package/@google/genai)

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- Node.js 18 ou superior instalado
- npm ou yarn

### 1. Clonar o repositório
```bash
git clone https://github.com/SEU-UTILIZADOR/oz-virtual-library.git
cd oz-virtual-library
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Crie um ficheiro `.env` baseado no `.env.example`:
```bash
cp .env.example .env
```
Preencha a sua `GEMINI_API_KEY` (se pretender utilizar as funções de IA).

### 4. Iniciar em ambiente de desenvolvimento
```bash
npm run dev
```
Abra o navegador em `http://localhost:3000`.

### 5. Compilar para Produção
```bash
npm run build
npm start
```

---

## 📄 Licença
Distribuído sob a licença MIT. Consulte o ficheiro `LICENSE` para mais informações.
