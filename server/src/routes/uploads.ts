import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { ApiError } from '../lib/errors';
import { assertOrgAccess, assertOrgRole, requireAuth } from '../middleware/auth';

export const uploadsRouter = Router({ mergeParams: true });

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { organizationId } = req.params as { organizationId: string };
    const orgDir = path.join(config.uploadDir, 'organizations', organizationId);
    fs.mkdirSync(orgDir, { recursive: true });
    cb(null, orgDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '') || '.png';
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new ApiError(400, 'invalid_file', 'Only image uploads are allowed.'));
      return;
    }
    cb(null, true);
  },
});

// Authorize BEFORE multer writes anything to disk.
function requireLogoWriteAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const { organizationId } = req.params as { organizationId: string };
    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'editor']);
    next();
  } catch (error) {
    next(error);
  }
}

uploadsRouter.use(requireAuth);

// Upload (or replace) an organization's logo. Optionally pass `existingPath`
// in the multipart body to delete the previous file after a successful upload.
uploadsRouter.post('/logo', requireLogoWriteAccess, upload.single('file'), async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    if (!req.file) {
      throw new ApiError(400, 'missing_file', 'No file provided.');
    }

    const storagePath = `organizations/${organizationId}/${req.file.filename}`;
    const url = `${config.publicBaseUrl}/uploads/${storagePath}`;

    const existingPath = typeof req.body?.existingPath === 'string' ? req.body.existingPath : null;
    if (existingPath && existingPath !== storagePath) {
      const absolute = path.resolve(config.uploadDir, existingPath);
      if (absolute.startsWith(config.uploadDir + path.sep)) {
        fs.promises.unlink(absolute).catch((error) => {
          console.warn('Failed to delete previous organization logo', { existingPath, error });
        });
      }
    }

    res.status(201).json({ url, storagePath });
  } catch (error) {
    next(error);
  }
});
