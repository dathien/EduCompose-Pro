import {
  AppBackupPayload,
  DrawingProject,
  ExamPaper,
  ExamQuestion,
  FormulaItem,
  OmrTemplateConfig,
  RecentFormulaEntry,
  WordDocumentRecord,
} from '../types';

const DB_NAME = 'smart_docx_pro_db';
const DB_VERSION = 2;

const STORES = {
  PERSONAL_FORMULAS: 'personal_formulas',
  FAVORITE_IDS: 'favorite_formula_ids',
  RECENT_FORMULAS: 'recent_formulas',
  DRAWINGS: 'drawings',
  DOCUMENTS: 'documents',
  SETTINGS: 'settings',
  FAVORITE_DRAWINGS: 'favorite_drawings',
  OMR_CONFIGS: 'omr_configs',
  QUESTION_BANK: 'question_bank',
  EXAMS: 'exams',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.PERSONAL_FORMULAS)) {
        db.createObjectStore(STORES.PERSONAL_FORMULAS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.FAVORITE_IDS)) {
        db.createObjectStore(STORES.FAVORITE_IDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.RECENT_FORMULAS)) {
        db.createObjectStore(STORES.RECENT_FORMULAS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DRAWINGS)) {
        db.createObjectStore(STORES.DRAWINGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      // v2 stores
      if (!db.objectStoreNames.contains(STORES.FAVORITE_DRAWINGS)) {
        db.createObjectStore(STORES.FAVORITE_DRAWINGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.OMR_CONFIGS)) {
        db.createObjectStore(STORES.OMR_CONFIGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.QUESTION_BANK)) {
        db.createObjectStore(STORES.QUESTION_BANK, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.EXAMS)) {
        db.createObjectStore(STORES.EXAMS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Không thể mở cơ sở dữ liệu cục bộ IndexedDB.'));
    };
  });

  return dbPromise;
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function putIntoStore<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Personal Formulas
export async function listPersonalFormulas(): Promise<FormulaItem[]> {
  const items = await getAllFromStore<FormulaItem>(STORES.PERSONAL_FORMULAS);
  return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function savePersonalFormula(formula: FormulaItem): Promise<void> {
  await putIntoStore(STORES.PERSONAL_FORMULAS, {
    ...formula,
    isCustom: true,
    updatedAt: Date.now(),
  });
}

export async function deletePersonalFormula(id: string): Promise<void> {
  await deleteFromStore(STORES.PERSONAL_FORMULAS, id);
}

// Favorite Formula IDs
export async function listFavoriteFormulaIds(): Promise<string[]> {
  const rows = await getAllFromStore<{ id: string }>(STORES.FAVORITE_IDS);
  return rows.map((r) => r.id);
}

export async function setFavoriteFormula(id: string, isFavorite: boolean): Promise<void> {
  if (isFavorite) {
    await putIntoStore(STORES.FAVORITE_IDS, { id });
  } else {
    await deleteFromStore(STORES.FAVORITE_IDS, id);
  }
}

// Recent Formulas (keep latest 18)
export async function listRecentFormulas(): Promise<RecentFormulaEntry[]> {
  const items = await getAllFromStore<RecentFormulaEntry>(STORES.RECENT_FORMULAS);
  return items.sort((a, b) => b.usedAt - a.usedAt);
}

export async function recordRecentFormula(entry: Omit<RecentFormulaEntry, 'usedAt'>): Promise<void> {
  await putIntoStore(STORES.RECENT_FORMULAS, { ...entry, usedAt: Date.now() });
  const all = await listRecentFormulas();
  if (all.length > 18) {
    const overflow = all.slice(18);
    for (const item of overflow) {
      await deleteFromStore(STORES.RECENT_FORMULAS, item.id);
    }
  }
}

// Favorite Drawing Library IDs
export async function listFavoriteDrawingIds(): Promise<string[]> {
  const rows = await getAllFromStore<{ id: string }>(STORES.FAVORITE_DRAWINGS);
  return rows.map((r) => r.id);
}

export async function setFavoriteDrawingId(id: string, isFavorite: boolean): Promise<void> {
  if (isFavorite) {
    await putIntoStore(STORES.FAVORITE_DRAWINGS, { id });
  } else {
    await deleteFromStore(STORES.FAVORITE_DRAWINGS, id);
  }
}

// Drawing Projects
export async function listDrawingProjects(): Promise<DrawingProject[]> {
  const items = await getAllFromStore<DrawingProject>(STORES.DRAWINGS);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDrawingProject(id: string): Promise<DrawingProject | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.DRAWINGS, 'readonly');
    const req = tx.objectStore(STORES.DRAWINGS).get(id);
    req.onsuccess = () => resolve(req.result as DrawingProject | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDrawingProject(project: DrawingProject): Promise<void> {
  await putIntoStore(STORES.DRAWINGS, { ...project, updatedAt: Date.now() });
}

export async function deleteDrawingProject(id: string): Promise<void> {
  await deleteFromStore(STORES.DRAWINGS, id);
}

// Word Documents
export async function listWordDocuments(): Promise<WordDocumentRecord[]> {
  const items = await getAllFromStore<WordDocumentRecord>(STORES.DOCUMENTS);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWordDocument(doc: WordDocumentRecord): Promise<void> {
  await putIntoStore(STORES.DOCUMENTS, { ...doc, updatedAt: Date.now() });
}

export async function deleteWordDocument(id: string): Promise<void> {
  await deleteFromStore(STORES.DOCUMENTS, id);
}

// OMR Configs
export async function listOmrConfigs(): Promise<OmrTemplateConfig[]> {
  const items = await getAllFromStore<OmrTemplateConfig>(STORES.OMR_CONFIGS);
  return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveOmrConfig(cfg: OmrTemplateConfig): Promise<void> {
  await putIntoStore(STORES.OMR_CONFIGS, { ...cfg, updatedAt: Date.now() });
}

export async function deleteOmrConfig(id: string): Promise<void> {
  await deleteFromStore(STORES.OMR_CONFIGS, id);
}

// Question Bank
export async function listQuestionBank(): Promise<ExamQuestion[]> {
  const items = await getAllFromStore<ExamQuestion>(STORES.QUESTION_BANK);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveQuestionBankItem(q: ExamQuestion): Promise<void> {
  await putIntoStore(STORES.QUESTION_BANK, { ...q, updatedAt: Date.now() });
}

export async function deleteQuestionBankItem(id: string): Promise<void> {
  await deleteFromStore(STORES.QUESTION_BANK, id);
}

// Exams
export async function listExams(): Promise<ExamPaper[]> {
  const items = await getAllFromStore<ExamPaper>(STORES.EXAMS);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveExamPaper(exam: ExamPaper): Promise<void> {
  await putIntoStore(STORES.EXAMS, { ...exam, updatedAt: Date.now() });
}

export async function deleteExamPaper(id: string): Promise<void> {
  await deleteFromStore(STORES.EXAMS, id);
}

// Settings
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.SETTINGS, 'readonly');
    const req = tx.objectStore(STORES.SETTINGS).get(key);
    req.onsuccess = () => {
      if (req.result && typeof req.result.value !== 'undefined') {
        resolve(req.result.value as T);
      } else {
        resolve(fallback);
      }
    };
    req.onerror = () => resolve(fallback);
  });
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await putIntoStore(STORES.SETTINGS, { key, value });
}

// Full Backup Export / Import (supports v1 & v2)
export async function exportAllDataBackup(): Promise<AppBackupPayload> {
  const [
    personalFormulas,
    favoriteFormulaIds,
    recentFormulas,
    drawings,
    documents,
    favoriteDrawingIds,
    omrConfigs,
    questionBank,
    exams,
  ] = await Promise.all([
    listPersonalFormulas(),
    listFavoriteFormulaIds(),
    listRecentFormulas(),
    listDrawingProjects(),
    listWordDocuments(),
    listFavoriteDrawingIds(),
    listOmrConfigs(),
    listQuestionBank(),
    listExams(),
  ]);

  return {
    app: 'SMART DOCX PRO',
    version: DB_VERSION,
    exportedAt: Date.now(),
    personalFormulas,
    favoriteFormulaIds,
    recentFormulas,
    drawings,
    documents,
    favoriteDrawingIds,
    omrConfigs,
    questionBank,
    exams,
  };
}

export async function importDataBackup(payload: AppBackupPayload): Promise<{
  formulas: number;
  drawings: number;
  documents: number;
  questions: number;
  exams: number;
}> {
  if (!payload || payload.app !== 'SMART DOCX PRO') {
    throw new Error('Tệp sao lưu không đúng định dạng của SMART DOCX PRO.');
  }

  let formulaCount = 0;
  let drawingCount = 0;
  let documentCount = 0;
  let questionCount = 0;
  let examCount = 0;

  if (Array.isArray(payload.personalFormulas)) {
    for (const f of payload.personalFormulas) {
      if (f?.id && f?.latex) {
        await putIntoStore(STORES.PERSONAL_FORMULAS, f);
        formulaCount++;
      }
    }
  }

  if (Array.isArray(payload.favoriteFormulaIds)) {
    for (const id of payload.favoriteFormulaIds) {
      if (typeof id === 'string') {
        await putIntoStore(STORES.FAVORITE_IDS, { id });
      }
    }
  }

  if (Array.isArray(payload.recentFormulas)) {
    for (const r of payload.recentFormulas) {
      if (r?.id && r?.latex) {
        await putIntoStore(STORES.RECENT_FORMULAS, r);
      }
    }
  }

  if (Array.isArray(payload.drawings)) {
    for (const d of payload.drawings) {
      if (d?.id && Array.isArray(d.elements)) {
        await putIntoStore(STORES.DRAWINGS, d);
        drawingCount++;
      }
    }
  }

  if (Array.isArray(payload.documents)) {
    for (const doc of payload.documents) {
      if (doc?.id && doc?.name) {
        await putIntoStore(STORES.DOCUMENTS, doc);
        documentCount++;
      }
    }
  }

  if (Array.isArray(payload.favoriteDrawingIds)) {
    for (const id of payload.favoriteDrawingIds) {
      if (typeof id === 'string') {
        await putIntoStore(STORES.FAVORITE_DRAWINGS, { id });
      }
    }
  }

  if (Array.isArray(payload.omrConfigs)) {
    for (const cfg of payload.omrConfigs) {
      if (cfg?.id) {
        await putIntoStore(STORES.OMR_CONFIGS, cfg);
      }
    }
  }

  if (Array.isArray(payload.questionBank)) {
    for (const q of payload.questionBank) {
      if (q?.id && q?.stem) {
        await putIntoStore(STORES.QUESTION_BANK, q);
        questionCount++;
      }
    }
  }

  if (Array.isArray(payload.exams)) {
    for (const ex of payload.exams) {
      if (ex?.id && ex?.title) {
        await putIntoStore(STORES.EXAMS, ex);
        examCount++;
      }
    }
  }

  return {
    formulas: formulaCount,
    drawings: drawingCount,
    documents: documentCount,
    questions: questionCount,
    exams: examCount,
  };
}

export async function runRichTextMigrationIfNeeded(): Promise<void> {
  const MIGRATION_KEY = 'smart_docx_richtext_migration_v1';
  try {
    const alreadyDone = await getSetting<boolean>(MIGRATION_KEY, false);
    if (alreadyDone) return;

    const { parseMixedTextToRichHtml, extractFormulaNodes } = await import(
      '../core/math/richTextCodec'
    );

    const migrateQuestion = (q: ExamQuestion): ExamQuestion => {
      const stemHtml = parseMixedTextToRichHtml(q.stem);
      const passageHtml = q.passage ? parseMixedTextToRichHtml(q.passage) : q.passage;
      const solutionHtml = q.solution ? parseMixedTextToRichHtml(q.solution) : q.solution;
      const gradingHtml = q.gradingGuide ? parseMixedTextToRichHtml(q.gradingGuide) : q.gradingGuide;
      const shortHtml = q.shortAnswer ? parseMixedTextToRichHtml(q.shortAnswer) : q.shortAnswer;
      const options = q.options?.map((o) => ({
        ...o,
        text: parseMixedTextToRichHtml(o.text),
      }));
      const tfItems = q.tfItems?.map((s) => ({
        ...s,
        text: parseMixedTextToRichHtml(s.text),
      }));
      const formulaNodes = [
        ...extractFormulaNodes(stemHtml),
        ...extractFormulaNodes(solutionHtml),
        ...(options || []).flatMap((o) => extractFormulaNodes(o.text)),
        ...(tfItems || []).flatMap((s) => extractFormulaNodes(s.text)),
      ];
      return {
        ...q,
        stem: stemHtml,
        passage: passageHtml,
        solution: solutionHtml,
        gradingGuide: gradingHtml,
        shortAnswer: shortHtml,
        options,
        tfItems,
        formulaNodes,
      };
    };

    const [bankItems, examItems] = await Promise.all([listQuestionBank(), listExams()]);
    for (const q of bankItems) {
      await putIntoStore(STORES.QUESTION_BANK, migrateQuestion(q));
    }
    for (const ex of examItems) {
      await putIntoStore(STORES.EXAMS, {
        ...ex,
        questions: ex.questions.map(migrateQuestion),
      });
    }

    await setSetting(MIGRATION_KEY, true);
  } catch {
    // Non-fatal: keep existing user data completely untouched if migration fails
  }
}
