import { supabaseAdmin } from '../services/supabaseAdmin.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const {
      data: { user },
      error
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    if (user.app_metadata?.is_banned) {
      return res.status(403).json({ error: 'banned', message: 'Your account is blocked.' });
    }
    
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
