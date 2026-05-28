import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Admin User Creation
  app.post("/api/admin/create-user", async (req, res) => {
    try {
      const { email, password, displayName, role } = req.body;
      const adminSecret = req.headers.authorization;
      
      // Basic protection: check if the request actually comes from an admin by matching a custom header or checking the JWT.
      // But actually, just relying on the Service Role key in env variable is backend security.
      // To prevent any user from calling this from the frontend, we verify the requester's JWT.
      
      if (!adminSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "Server missing Supabase credentials" });
      }

      // 1. Verify requester is admin
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      const token = adminSecret.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
      
      if (userError || !user || user.user_metadata?.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only admins can create users" });
      }

      // 2. Create the new user
      const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          role: role || 'user'
        }
      });

      if (createError) {
        return res.status(400).json({ error: createError.message });
      }

      res.json({ success: true, user: newUser.user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
