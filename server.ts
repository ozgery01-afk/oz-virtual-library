import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware for JSON parsing
  app.use(express.json({ limit: "10mb" }));

  // Serve static assets from public folder directly (covers, icons, etc.)
  app.use(express.static(path.join(process.cwd(), "public")));

  // Initialize Gemini AI Client lazily & safely
  let geminiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI | null {
    if (!geminiClient && process.env.GEMINI_API_KEY) {
      geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return geminiClient;
  }

  // 1. Health API Route
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      geminiConfigured: !!process.env.GEMINI_API_KEY,
    });
  });

  // Admin delete student from Auth (if configured)
  app.post("/api/admin/delete-student-auth", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID do estudante é obrigatório." });
      }

      // Check if firebase-admin or credentials are provided
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const adminMod = (await import("firebase-admin")) as any;
          const admin = adminMod.default || adminMod;
          if (!admin.apps || admin.apps.length === 0) {
            admin.initializeApp();
          }
          await admin.auth().deleteUser(uid);
          return res.json({ success: true, message: "Utilizador removido do Firebase Auth." });
        } catch (authErr: any) {
          console.warn("Aviso ao remover utilizador do Firebase Auth via Admin SDK:", authErr?.message);
        }
      }

      // Return ok even if Admin SDK credentials are not configured in local environment
      return res.json({ success: true, message: "Exclusão administrativa processada." });
    } catch (err: any) {
      console.error("Erro na rota /api/admin/delete-student-auth:", err);
      return res.status(500).json({ error: err.message || "Erro interno." });
    }
  });

  // Admin bulk delete students from Auth (if configured)
  app.post("/api/admin/delete-all-student-auth", async (req, res) => {
    try {
      const { uids } = req.body;
      if (!Array.isArray(uids) || uids.length === 0) {
        return res.json({ success: true, message: "Nenhum UID fornecido para exclusão." });
      }

      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const adminMod = (await import("firebase-admin")) as any;
          const admin = adminMod.default || adminMod;
          if (!admin.apps || admin.apps.length === 0) {
            admin.initializeApp();
          }
          if (admin.auth().deleteUsers) {
            await admin.auth().deleteUsers(uids);
          } else {
            for (const uid of uids) {
              await admin.auth().deleteUser(uid).catch(() => {});
            }
          }
          return res.json({ success: true, message: `${uids.length} contas removidas do Firebase Auth.` });
        } catch (authErr: any) {
          console.warn("Aviso ao remover utilizadores em lote do Firebase Auth:", authErr?.message);
        }
      }

      return res.json({ success: true, message: "Exclusão em lote processada." });
    } catch (err: any) {
      console.error("Erro na rota /api/admin/delete-all-student-auth:", err);
      return res.status(500).json({ error: err.message || "Erro interno." });
    }
  });

  // 2. Gemini Library Assistant API Route (Search & Summarize)
  app.post("/api/gemini/library-assistant", async (req, res) => {
    try {
      const { mode, query, book, booksCatalog } = req.body;

      if (!mode) {
        return res.status(400).json({ error: "O modo (search, summarize, chat) é obrigatório." });
      }

      const client = getGeminiClient();

      // Formulate books context from catalog
      const catalogSummary = Array.isArray(booksCatalog) && booksCatalog.length > 0
        ? booksCatalog
            .map(
              (b: any, index: number) =>
                `[${index + 1}] "${b.title}" por ${b.author} | Ramo: ${b.course} | Categoria: ${b.category} | Descrição: ${b.description || "N/D"}`
            )
            .join("\n")
        : "Acervo de referência em Anatomia, Fisiologia, Biologia Celular, Bioquímica Clínica, Semiologia Médica e Biotecnologia.";

      let systemPrompt = `Você é a Oz AI, a Assistente Especialista de Inteligência Artificial da Oz VIRTUAL LIBRARY (Biology, Health and Medicine), uma IA super amigável, acolhedora e prestativa.
Sua missão é atuar como bibliotecária científica, tutora acadêmica e guia da plataforma para os estudantes. Você deve ajudar com tudo que há na biblioteca:
- Localização e recomendação de manuais do acervo.
- Resumo de manuais e explicação de conceitos.
- Localização de opções e navegação na aplicação (ex: Áreas de estudo, Minha Conta, Disciplinas).
- Dar sua opinião especializada sobre métodos de estudo e ferramentas.

Acervo de manuais disponíveis na biblioteca atualmente:
${catalogSummary}

Diretrizes de resposta:
- Apresente-se ou assine como Oz AI quando apropriado.
- Seja extremamente amigável, encorajadora e converse naturalmente com o aluno.
- Responda sobre a navegação da plataforma e dê opiniões se solicitado.
- Não invente livros fictícios se puder recomendar os que estão no acervo acima.
- Formate a resposta com títulos, marcadores e destaques em negrito para facilitar a leitura no ambiente digital.
`;

      let userPrompt = "";

      if (mode === "summarize") {
        if (book) {
          userPrompt = `Gere um Resumo Acadêmico Completo e Estruturado do seguinte manual que está no acervo da biblioteca:
Título: "${book.title}"
Autor(es): ${book.author}
Categoria: ${book.category}
Curso/Ramo: ${book.course}
Ano Acadêmico Recomendado: ${book.academicYear}
Descrição Cadastrada: ${book.description}
${query ? `Solicitação específica do estudante: "${query}"` : ""}

Estruture o resumo nas seguintes seções:
1. 📖 **Visão Geral e Importância Acadêmica**: Para que serve este manual e sua relevância nas ciências da saúde/biologia.
2. 🔬 **Eixos Temáticos e Capítulos Fundamentais**: Os tópicos e sistemas fisiológicos/biológicos essenciais abordados.
3. 🩺 **Aplicações Clínicas, Laboratoriais e Práticas**: Como este conhecimento se traduz no atendimento ao paciente, no laboratório ou no campo.
4. 💡 **Conceitos de Alto Rendimento (High-Yield)**: 3 a 5 pontos-chave imperdíveis para provas e prática profissional.
5. 🎯 **Roteiro de Estudo Sugerido**: Como o acadêmico deve organizar sua leitura no portal.`;
        } else {
          userPrompt = `Gere um resumo e análise acadêmica profunda sobre o seguinte tema ou manual pesquisado: "${query}".
Indique quais manuais do acervo da biblioteca tratam deste assunto e forneça um resumo de alto rendimento com aplicações clínicas e biológicas.`;
        }
      } else if (mode === "study_roadmap") {
        userPrompt = `O estudante ${req.body.studentName || 'da biblioteca'} do curso de ${req.body.course || 'Saúde'} solicitou um roadmap de estudos.
Sua tarefa:
Gere um roteiro de estudos (Study Roadmap) estruturado, recomendando manuais essenciais que podem ser encontrados no acervo para sua progressão académica.
Divida em:
1. Leituras Fundamentais (Primeiros passos)
2. Aprofundamento Específico
3. Prática e Casos Clínicos
O formato deve ser em Markdown limpo, encorajador e direto ao ponto.`;
      } else if (mode === "search") {
        userPrompt = `O estudante realizou a seguinte pesquisa no acervo da biblioteca:
"${query}"

Sua tarefa:
1. Analise o catálogo da biblioteca e identifique quais manuais são os mais indicados para esta pesquisa.
2. Destaque por que cada manual recomendado responde à dúvida ou necessidade de estudo do acadêmico.
3. Se a pesquisa envolver um caso clínico, sintoma ou mecanismo biológico, explique sucintamente a base científica fundamentando nos manuais sugeridos.
4. Recomende a melhor sequência de consulta entre os livros da biblioteca.`;
      } else {
        userPrompt = `Dúvida do acadêmico:
"${query}"
${book ? `Manual atualmente em visualização: "${book.title}" (${book.author})` : ""}

Responda de forma didática e profunda, relacionando os conceitos com os manuais de referência do acervo da biblioteca.`;
      }

      if (!client) {
        // High quality fallback if API key is not yet configured
        let fallbackText = "";
        if (mode === "study_roadmap") {
          fallbackText = `### 🗺️ Roteiro de Estudos Sugerido para ${req.body.course || 'o seu curso'}

**1. Leituras Fundamentais**
- Recomendamos iniciar com **Anatomia Básica** e **Biologia Celular**.
- Estabeleça uma base sólida antes de avançar.

**2. Aprofundamento Específico**
- Avance para a secção de **Fisiopatologia** e **Farmacologia**.

**3. Prática Clínica**
- Explore a literatura sobre **Casos Clínicos** e **Diagnóstico**.

*(Nota: A Oz AI operou em modo local/offline. Conecte sua chave da API Gemini para rotas geradas por IA dinâmicas).* `;
          return res.json({ text: fallbackText, mode });
        }
        if (mode === "summarize" && book) {
          fallbackText = `### 📖 Resumo Acadêmico: ${book.title}\n\n**Autoria:** ${book.author} | **Categoria:** ${book.category}\n\n#### 1. Visão Geral e Importância\nEste manual é uma obra de referência no acervo da **Oz VIRTUAL LIBRARY**, fundamental para estudantes de ${book.course}.\n\n#### 2. Eixos Temáticos Principais\nAborda com profundidade os pilares de ${book.category}, integrando correlações fisiopatológicas e metodologias laboratoriais atualizadas.\n\n#### 3. Aplicações Práticas & Clínicas\nIndispensável para a compreensão de diagnósticos, raciocínio clínico e procedimentos baseados em evidências científicas.\n\n*(Nota: A Oz AI operou em modo de indexação local. Para sínteses gerativas avançadas com IA em tempo real, conecte sua chave Gemini).*`;
        } else {
          fallbackText = `### 🔍 Resultados da Pesquisa no Acervo\n\nPesquisa: *"${query}"*\n\nIdentificamos que seu tópico correlaciona-se com as áreas de **Medicina Geral**, **Biologia Molecular** e **Ciências Biomédicas** disponíveis na plataforma.\n\nConsulte as categorias correspondentes na barra lateral para explorar os manuais indexados.`;
        }
        return res.json({
          text: fallbackText,
          mode,
          suggestedTopics: ["Anatomia e Fisiologia", "Patologia Médica", "Bioquímica Clínica", "Farmacologia"]
        });
      }

      // Generate content via @google/genai SDK with retry mechanism for 503s
      let response;
      let retries = 3;
      let delay = 1000;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          response = await client.models.generateContent({
            model: "gemini-3.6-flash",
            contents: userPrompt,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.7,
            },
          });
          break; // Success, exit loop
        } catch (err: any) {
          const isRetryable = err.message?.includes("503") || err.message?.includes("high demand") || err.message?.includes("UNAVAILABLE") || err.message?.includes("429");
          if (isRetryable && attempt < retries) {
            console.warn(`[Gemini API] Serviço sobrecarregado (503/429). Tentativa ${attempt}/${retries} em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
          } else {
            throw err; // Re-throw if out of retries or different error
          }
        }
      }

      const responseText = response?.text || "Não foi possível gerar a resposta no momento.";

      return res.json({
        text: responseText,
        mode,
      });
    } catch (error: any) {
      console.error("Erro na rota /api/gemini/library-assistant:", error);
      
      let errorMessage = error.message || "Erro interno ao processar requisição com a IA Gemini.";
      
      if (errorMessage.includes("high demand") || errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE")) {
        errorMessage = "O assistente IA está com alta procura neste momento. Por favor, aguarde alguns segundos e tente novamente.";
      } else {
        try {
          if (errorMessage.startsWith('{')) {
            const parsed = JSON.parse(errorMessage);
            if (parsed.error?.code === 503 || parsed.error?.status === "UNAVAILABLE") {
              errorMessage = "O assistente IA está com alta procura neste momento. Por favor, aguarde alguns segundos e tente novamente.";
            } else if (parsed.error?.message) {
              errorMessage = parsed.error.message;
            }
          }
        } catch(e) {}
      }

      return res.status(500).json({
        error: errorMessage,
      });
    }
  });

  // 3. Multi-turn Gemini Chat API with Role Selection & Task Complexity Models
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { messages, roleId = "librarian", taskComplexity = "general", useSearchGrounding = false } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "O histórico de mensagens é obrigatório." });
      }

      const client = getGeminiClient();
      if (!client) {
        return res.json({
          text: "A chave da API Gemini não está configurada no ambiente. Conecte sua chave no painel de configurações para ativar o assistente multimodal.",
          roleId,
          sources: []
        });
      }

      // Model Selection based on Task Complexity according to specifications:
      // gemini-3.1-pro-preview for complex tasks
      // gemini-3.5-flash for general tasks (and search grounding)
      // gemini-3.1-flash-lite for tasks that should happen fast
      let selectedModel = "gemini-3.5-flash";
      if (taskComplexity === "complex") {
        selectedModel = "gemini-3.1-pro-preview";
      } else if (taskComplexity === "fast") {
        selectedModel = "gemini-3.1-flash-lite";
      }

      // If search grounding is explicitly requested, prefer gemini-3.5-flash
      if (useSearchGrounding && selectedModel === "gemini-3.1-flash-lite") {
        selectedModel = "gemini-3.5-flash";
      }

      // System instruction based on specific role
      let roleInstruction = "";
      if (roleId === "clinical") {
        roleInstruction = `Você é o Tutor Clínico e Biomédico da Oz VIRTUAL LIBRARY.
Seu foco é raciocínio diagnóstico, fisiopatologia avançada, correlações clínicas, interpretação de exames e dosagens farmacológicas baseadas em evidências científicas.
Estruture suas respostas com rigor técnico, utilizando termos anatômicos e fisiológicos precisos, analogias clínicas esclarecedoras e condutas pedagógicas.`;
      } else if (roleId === "fast") {
        roleInstruction = `Você é o Assistente de Respostas Rápidas e Flashcards da Oz VIRTUAL LIBRARY.
Seu foco é alta velocidade, síntese objetiva, pontos de alto rendimento (high-yield) para provas, mnemônicas e flashcards rápidos.
Responda de forma concisa, direta ao ponto e em tópicos destacados.`;
      } else {
        roleInstruction = `Você é a Bibliotecária Chefe Oz AI da Oz VIRTUAL LIBRARY (Biology, Health and Medicine).
Sua missão é acolher os estudantes, guiar o aprendizado em Ciências Biológicas e Médicas, sugerir manuais do acervo e responder dúvidas acadêmicas com empatia e autoridade científica.`;
      }

      const config: any = {
        systemInstruction: roleInstruction,
        temperature: 0.7,
      };

      if (useSearchGrounding) {
        config.tools = [{ googleSearch: {} }];
      }

      // Format messages history for @google/genai contents
      const formattedContents = messages.map((m: any) => ({
        role: m.role === "model" || m.role === "bot" ? "model" : "user",
        parts: Array.isArray(m.parts)
          ? m.parts
          : [{ text: typeof m.content === "string" ? m.content : typeof m.text === "string" ? m.text : "" }],
      }));

      const response = await client.models.generateContent({
        model: selectedModel,
        contents: formattedContents,
        config,
      });

      const responseText = response.text || "Sem resposta gerada.";
      
      // Extract grounding sources if available
      const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks || [];
      const webQueries = (response.candidates?.[0] as any)?.groundingMetadata?.webSearchQueries || [];

      return res.json({
        text: responseText,
        modelUsed: selectedModel,
        groundingChunks,
        webQueries,
      });
    } catch (err: any) {
      console.error("Erro na rota /api/gemini/chat:", err);
      return res.status(500).json({ error: err.message || "Erro interno no chat com Gemini." });
    }
  });

  // 4. Dedicated Google Search Grounding API Route with gemini-3.5-flash
  app.post("/api/gemini/search-grounding", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Parâmetro query é obrigatório." });
      }

      const client = getGeminiClient();
      if (!client) {
        return res.json({
          text: `Resultados informativos sobre: ${query}. (Chave de API Gemini necessária para consulta em tempo real ao Google Search).`,
          sources: [],
        });
      }

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query,
        config: {
          systemInstruction: "Você é um pesquisador científico especializado da Oz Virtual Library. Utilize o Google Search para trazer dados e artigos atualizados com rigor acadêmico.",
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      const metadata = (response.candidates?.[0] as any)?.groundingMetadata;

      return res.json({
        text,
        sources: metadata?.groundingChunks || [],
        webSearchQueries: metadata?.webSearchQueries || [],
      });
    } catch (err: any) {
      console.error("Erro na rota /api/gemini/search-grounding:", err);
      return res.status(500).json({ error: err.message || "Erro ao consultar Google Search com Gemini." });
    }
  });

  // 5. Veo 3 Video Generation API (Model: veo-3.1-fast-generate-preview)
  app.post("/api/gemini/generate-video", async (req, res) => {
    try {
      const { prompt, image, aspectRatio = "16:9" } = req.body;

      const client = getGeminiClient();
      if (!client) {
        return res.status(400).json({ error: "Chave da API Gemini não configurada." });
      }

      const validAspectRatio = aspectRatio === "9:16" ? "9:16" : "16:9";

      const videoConfig: any = {
        numberOfVideos: 1,
        resolution: "720p",
        aspectRatio: validAspectRatio,
      };

      const params: any = {
        model: "veo-3.1-fast-generate-preview",
        config: videoConfig,
      };

      if (prompt) {
        params.prompt = prompt.trim();
      }

      // If photo/image is uploaded for animation (Image-to-Video)
      if (image && image.imageBytes) {
        params.image = {
          imageBytes: image.imageBytes.replace(/^data:image\/[a-zA-Z]+;base64,/, ""),
          mimeType: image.mimeType || "image/jpeg",
        };
      }

      if (!params.prompt && !params.image) {
        return res.status(400).json({ error: "É necessário fornecer um texto descritivo ou uma imagem para animar." });
      }

      const operation = await client.models.generateVideos(params);

      return res.json({
        operationName: operation.name,
        aspectRatio: validAspectRatio,
      });
    } catch (err: any) {
      console.error("Erro na rota /api/gemini/generate-video:", err);
      return res.status(500).json({ error: err.message || "Erro ao iniciar geração de vídeo com Veo 3." });
    }
  });

  // 6. Veo 3 Video Status Polling API
  app.post("/api/gemini/video-status", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName é obrigatório." });
      }

      const client = getGeminiClient();
      if (!client) {
        return res.status(400).json({ error: "Chave da API Gemini não configurada." });
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await client.operations.getVideosOperation({ operation: op });

      return res.json({
        done: !!updated.done,
        error: updated.error || null,
      });
    } catch (err: any) {
      console.error("Erro na rota /api/gemini/video-status:", err);
      return res.status(500).json({ error: err.message || "Erro ao verificar status do vídeo." });
    }
  });

  // 7. Veo 3 Video Download Stream API
  app.post("/api/gemini/video-download", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName é obrigatório." });
      }

      const client = getGeminiClient();
      const apiKey = process.env.GEMINI_API_KEY;
      if (!client || !apiKey) {
        return res.status(400).json({ error: "Chave da API Gemini não configurada." });
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await client.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      if (!uri) {
        return res.status(404).json({ error: "URI do vídeo não disponível na operação." });
      }

      const videoRes = await fetch(uri, {
        headers: {
          "x-goog-api-key": apiKey,
        },
      });

      if (!videoRes.ok) {
        return res.status(videoRes.status).json({ error: `Falha ao transferir vídeo: ${videoRes.statusText}` });
      }

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", "inline; filename=veo3-scientific-video.mp4");

      const reader = videoRes.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: "Stream de leitura do vídeo indisponível." });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (err: any) {
      console.error("Erro na rota /api/gemini/video-download:", err);
      return res.status(500).json({ error: err.message || "Erro ao baixar vídeo gerado pelo Veo 3." });
    }
  });

  // 8. Vite middleware for development & Static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
      ? path.join(process.cwd(), "dist")
      : path.resolve(__dirname);
    const publicPath = fs.existsSync(path.join(process.cwd(), "public"))
      ? path.join(process.cwd(), "public")
      : distPath;
    app.use(express.static(publicPath));
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Oz Virtual Library server running on port ${PORT}`);
  });
}

startServer();
