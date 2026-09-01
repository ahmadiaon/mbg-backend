import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const BACKEND_DIR = process.cwd();
const DOCS_DIR = join(BACKEND_DIR, 'docs');
const FRONTEND_README = join(BACKEND_DIR, '..', 'mbg-frontend', 'README.md');

interface DocItem {
  name: string;
  title: string;
}

// Dokumen di luar folder docs/ (didaftar manual)
const MANUAL_DOCS: { name: string; title: string; path: string }[] = [
  { name: 'README', title: 'README (Backend)', path: join(BACKEND_DIR, 'README.md') },
  { name: 'FRONTEND', title: 'README (Frontend)', path: FRONTEND_README },
];

@Controller('docs')
export class DocsController {
  @Get()
  list(): { success: boolean; data: DocItem[] } {
    const docs: DocItem[] = [];

    for (const d of MANUAL_DOCS) {
      if (existsSync(d.path)) {
        docs.push({ name: d.name, title: d.title });
      }
    }

    if (existsSync(DOCS_DIR)) {
      for (const f of readdirSync(DOCS_DIR)) {
        if (f.endsWith('.md')) {
          const name = f.replace(/\.md$/, '');
          docs.push({ name, title: name.replace(/-/g, ' ') });
        }
      }
    }

    return { success: true, data: docs };
  }

  @Get(':name')
  get(@Param('name') name: string): { success: boolean; name: string; content: string } {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '');
    const manual = MANUAL_DOCS.find((d) => d.name === safe);
    const filePath = manual ? manual.path : join(DOCS_DIR, `${safe}.md`);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Dokumentasi tidak ditemukan');
    }

    return {
      success: true,
      name: safe,
      content: readFileSync(filePath, 'utf-8'),
    };
  }
}
