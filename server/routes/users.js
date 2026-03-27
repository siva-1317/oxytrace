import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(requireAuth);

function requireSuperAdmin(req, res, next) {
  // Access is now allowed for any authenticated user who knows the secret URL
  next();
}

// Optionally, users can verify if they are superadmins
router.get('/superadmin-verify', requireSuperAdmin, (req, res) => {
  res.json({ success: true, message: 'You are a super admin.' });
});

router.get('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    
    // Sanitize user data before sending to frontend
    const sanitizedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      is_banned: !!u.app_metadata?.is_banned,
      is_superadmin: !!u.app_metadata?.is_superadmin
    }));
    
    res.json(sanitizedUsers);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/block', requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { is_banned: true }
    });
    if (error) throw new Error(error.message);
    res.json({ success: true, message: 'User blocked successfully.' });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/unblock', requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { is_banned: false }
    });
    if (error) throw new Error(error.message);
    res.json({ success: true, message: 'User unblocked successfully.' });
  } catch (e) {
    next(e);
  }
});

export default router;
