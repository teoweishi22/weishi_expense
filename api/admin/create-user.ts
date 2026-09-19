import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers?.authorization;
  const bearer = typeof authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!bearer) return res.status(401).json({ error: 'Please sign in again before creating a user.' });

  const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return res.status(503).json({ error: 'User creation is not configured on the server. Contact the administrator.' });
  }

  try {
    // This privileged client is server-only and must never inherit the caller's session.
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    });
    const { data: { user }, error: authError } = await admin.auth.getUser(bearer[1]);
    if (authError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    // user_metadata is editable by users and is never a source of admin authority.
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'Only an authorized administrator can create users.' });

    const { email, password, displayName = '', role = 'user' } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9._-]{0,63}@app\.local$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Use a username of 1–64 letters, numbers, dots, underscores, or hyphens, starting with a letter or number.' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 1024) {
      return res.status(400).json({ error: 'Password must contain at least 6 characters and no more than 1024 characters.' });
    }
    if (typeof displayName !== 'string' || displayName.trim().length > 100) {
      return res.status(400).json({ error: 'Display name must be text with at most 100 characters.' });
    }
    if (role !== 'user' && role !== 'admin') return res.status(400).json({ error: 'Choose Normal User or Admin.' });

    const { data, error } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true, // Existing username login uses internal @app.local addresses.
      app_metadata: { role },
      user_metadata: { display_name: displayName.trim() },
    });
    if (error) {
      if (['email_exists', 'user_already_exists'].includes(error.code || '')) {
        return res.status(409).json({ error: 'That username already exists. Choose another username.' });
      }
      if (error.code === 'weak_password') return res.status(400).json({ error: 'This password does not meet the password requirements. Use a longer password with uppercase and lowercase letters, numbers, and symbols.' });
      if (error.status === 429) return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
      return res.status(502).json({ error: 'Unable to create the user. Please contact the administrator.' });
    }
    if (!data.user) return res.status(502).json({ error: 'No user confirmation was returned. Check whether the username exists before retrying.' });
    return res.status(201).json({ user: { id: data.user.id, email: data.user.email } });
  } catch {
    // Never expose or log submitted passwords, tokens, or service credentials.
    return res.status(502).json({ error: 'User creation could not be confirmed. Check whether the username exists before retrying.' });
  }
}
