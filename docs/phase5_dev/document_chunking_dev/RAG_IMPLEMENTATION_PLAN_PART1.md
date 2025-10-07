# RAG Document Vectorization Implementation Plan - Part 1
## Cosmetics Ingredients B2B Customer Support Application

**Project Overview**: Vectorize 31,749 documents from 89 suppliers for RAG-based customer support
**Target**: High-precision ingredient information retrieval with comprehensive metadata filtering
**Timeline**: 4 weeks from start to production-ready system

---

## TABLE OF CONTENTS - PART 1

1. [Folder Structure Analysis](#1-folder-structure-analysis)
2. [Chunking Strategy](#2-chunking-strategy)
3. [Metadata Schema](#3-metadata-schema)
4. [Metadata Extraction Pipeline](#4-metadata-extraction-pipeline)
5. [Processing Architecture](#5-processing-architecture)

---

## 1. FOLDER STRUCTURE ANALYSIS

### Dataset Statistics

| Metric | Value | Notes |
|--------|-------|-------|
| **Total Files** | 31,749 | All file types |
| **Processable Documents** | ~30,208 | PDFs, Word, Excel, PowerPoint |
| **Total Directories** | 5,448 | Nested structure |
| **Suppliers** | 89 | Top-level organizations |
| **Average Files per Supplier** | ~356 | Varies significantly |
| **Folder Depth** | 3-4 levels | Supplier → Ingredient → Documents |

### Hierarchy Pattern

```
/PC/
├── {Supplier Name}/                    # 89 suppliers (e.g., "BASF", "ANHUI GREAT")
│   ├── - Certificate/                  # Supplier-level certifications (ISO, FSSC, HACCP)
│   ├── - Presentation/                 # Marketing materials and product catalogs
│   ├── {Ingredient Name}/              # Multiple ingredients per supplier
│   │   ├── Core Documents
│   │   │   ├── *_SDS.pdf              # Safety Data Sheet
│   │   │   ├── *_Spec.pdf             # Technical Specification
│   │   │   ├── *_COA*.pdf             # Certificate of Analysis (batch-specific)
│   │   │   └── *_TDS.pdf              # Technical Data Sheet
│   │   ├── Compliance Documents
│   │   │   ├── *_REACH*.pdf           # EU REACH Registration
│   │   │   ├── *_Halal*.pdf           # Halal Certification
│   │   │   ├── *_Vegan*.pdf           # Vegan Statement
│   │   │   ├── *_GMO*.pdf             # GMO-Free Statement
│   │   │   ├── *_Allergen*.pdf        # Allergen Information
│   │   │   └── *_Palm_Free*.pdf       # Palm Oil Free Statement
│   │   ├── Composition & Manufacturing
│   │   │   ├── *_Composition*.pdf     # Ingredient Composition
│   │   │   ├── *_Manufacturing*.pdf   # Manufacturing Process
│   │   │   └── *_Flow_Chart*.pdf      # Process Flow Diagram
│   │   ├── - Old/                      # Archived/superseded versions
│   │   └── {subfolder}/                # Additional categorization
│   └── {Another Ingredient}/
```

### Real-World Examples

**Example 1: ANHUI GREAT Supplier**
```
/PC/ANHUI GREAT/
├── - Certificate/
│   ├── Anhui Great_Halal Cert_BPJPH_Issue.08.05.25_Essential oils.pdf
│   ├── Cert FSSC_Anhui Great Nation_EXP2026.09.11.pdf
│   ├── Cert HACCP__Anhui Great Nation_EXP2026.09.11.pdf
│   └── Cert ISO22000__Anhui Great Nation_EXP2026.09.11.pdf
├── - Presentation/
│   └── ANHUI GREAT_Product Catalog_2024.pdf
├── Menthol Crystal (Natural)_(22.03.2023)/
│   ├── Menthol crystals_TDS-Spec_08.24.pdf
│   ├── Menthol Crystals_MSDS_05.24.pdf
│   ├── Menthol Crystal_Animal Testing_20.11.pdf
│   ├── Menthol Crystal_GMO Free.pdf
│   ├── Menthol Crystal_Natural Statement_19.03.pdf
│   ├── Menthol Crystal_REACH.pdf
│   ├── Menthol Crystal_Vegan_20.10.pdf
│   ├── เลข 15 หลัก DRM ของ MENTHOL CRYSTALS_ANHUI.pdf  # Thai regulatory doc
│   └── - Old/
│       ├── Menthol Crystal_SDS_20.06.pdf
│       └── Menthol Crystal_Specification_22.01.pdf
├── Camphor Synthetic EP (AGN063-HC)/
│   ├── Camphor synthetic EP_SDS_06.24.pdf
│   ├── Camphor synthetic EP_Spec_06.24.pdf
│   ├── COA-Camphor synthetic EP20240310.pdf
│   └── Camphor Synthetic EP_Halal Statement_06.24.pdf
└── (more ingredients...)
```

**Example 2: AQUOGEL-LAB Supplier**
```
/PC/AQUOGEL-LAB/
├── - Other/
├── Picture/
├── AQGLAB-PDBW6082_Blue/
│   ├── AQGLAB-PDBW6082_Spec_16.02.pdf
│   ├── AQGLAB-PDBW6082_SDS.pdf
│   ├── AQGLAB-PVBW6082_COA_(20C05A05a).pdf
│   ├── AQGLAB-PDBW6082_GMO_Free_22.08.pdf
│   ├── AQGLAB-PDBW6082_Vegan_22.07.pdf
│   ├── AQGLAB-PDBW6082_Palm Free_22.08.pdf
│   ├── AQGLAB-PDBW6082_REACH.pdf
│   └── Old/
│       └── AQGLAB-PDBW6082_Spec.pdf
└── AQGLAB-PDPW6090_Pink_Discontinued/
    ├── AQGLAB-PDPW6090_Spec.pdf
    ├── AQGLAB-PDPW6090_SDS.pdf
    ├── AQGLAB-PDPW6090_COA(19J06A06a）.pdf
    └── (more docs...)
```

### Document Type Categories (By Frequency)

| Document Type | Estimated Count | Naming Patterns | Purpose |
|---------------|-----------------|-----------------|---------|
| **Safety Data Sheets** | ~2,053 | `*_SDS.pdf`, `*_MSDS.pdf` | Safety, handling, hazard info |
| **Technical Specifications** | ~808 | `*_Spec.pdf`, `*_TDS.pdf` | Product specifications, quality parameters |
| **Certificate of Analysis** | ~500-1000 | `*_COA*.pdf`, `COA-*.pdf` | Batch testing results |
| **REACH Registration** | ~1,097 | `*_REACH*.pdf` | EU chemical compliance |
| **Halal Statements/Certs** | ~1,372 | `*_Halal*.pdf` | Religious compliance |
| **Vegan Statements** | ~714 | `*_Vegan*.pdf` | Animal-derived ingredient status |
| **GMO Statements** | ~500 | `*_GMO*.pdf` | Genetically modified organism status |
| **Composition Sheets** | ~1,158 | `*_Composition*.pdf` | Ingredient breakdown |
| **Allergen Statements** | ~300 | `*_Allergen*.pdf` | Allergen presence/absence |
| **Manufacturing Docs** | ~664 | `*_Manufacturing*.pdf`, `*_Flow*.pdf` | Production process |
| **Product Presentations** | ~887 | `*_Presentation*.pdf`, `*_Catalog*.pdf` | Marketing materials |
| **ISO Certificates** | ~200 | `*ISO*.pdf`, `Cert_ISO*.pdf` | Quality management certs |
| **Animal Testing** | ~623 | `*_Animal_Testing*.pdf`, `*_Cruelty*.pdf` | Animal testing policy |
| **Palm Free** | ~400 | `*_Palm_Free*.pdf` | Palm oil content statement |

### File Format Distribution

| Format | Count | Percentage | Processing Method |
|--------|-------|------------|-------------------|
| PDF (case variations) | 28,079 | 88.4% | Docling (primary), Mistral OCR (fallback) |
| DOC/DOCX | 1,627 | 5.1% | Docling text extraction |
| XLS/XLSX | 270 | 0.9% | Structured data extraction |
| PPT/PPTX | 232 | 0.7% | Slide text extraction |
| Images (JPG, PNG, TIF, BMP) | 941 | 3.0% | OCR processing |
| MSG (Outlook emails) | 162 | 0.5% | Email parsing (optional) |
| Other (ZIP, MP4, TXT, RTF) | ~438 | 1.4% | Case-by-case handling |

### Key Observations

1. **Versioning Pattern**: Common use of `- Old/` folders for superseded documents
2. **Date Encoding**: Multiple formats in filenames (e.g., `_(22.03.2023)`, `_05.24`, `_23.06.PDF`)
3. **Discontinued Products**: Folders with Thai text "ยกเลิกการขาย" or "Discontinued" in name
4. **Multi-language**: Mixed English/Thai content (regulatory docs)
5. **Batch Tracking**: COA documents with lot numbers (e.g., `(20C05A05a)`, `19J06A06a`)
6. **Special Characters**: Some folders/files with non-ASCII characters
7. **Certificates with Expiry**: Many certs have expiry dates in filenames (e.g., `_EXP2026.09.11`)

---

## 2. CHUNKING STRATEGY

### Recommended Approach: **Hybrid Semantic + Structural Chunking**

The nature of technical documentation requires a sophisticated chunking strategy that preserves semantic coherence while enabling precise retrieval.

### Strategy A: Document-Level Chunking (Primary)

**Concept**: Treat each complete document as a single semantic unit with comprehensive metadata.

**Rationale**:
- Technical documents (SDS, COA, Spec) are already semantically coherent
- Each document serves a specific, complete purpose
- Customer queries typically require full document context (e.g., "Show me the SDS for Menthol Crystal")
- Average document size likely fits within embedding context window (AWS Titan v2: 8K tokens)
- Enables precise document-level retrieval with metadata filtering

**When to Use**:
- Documents < 6,000 tokens (~4,500 words)
- Single-purpose documents (certificates, statements, single-page specs)
- Highly structured formats (COA, spec sheets with clear sections)

**Implementation**:
```typescript
interface DocumentChunk {
  chunk_id: string;           // UUID
  document_id: string;         // Parent document UUID
  chunk_index: 0;              // Always 0 for single-chunk docs
  total_chunks: 1;             // Always 1 for single-chunk docs
  chunk_text: string;          // Full document text
  chunk_type: 'full_document';
  embedding_vector: number[];  // 1024-dimensional
}
```

### Strategy B: Section-Level Chunking (For Large Documents)

**Concept**: Split large documents by semantic sections while preserving context.

**When to Use**:
- Documents > 6,000 tokens
- Multi-section technical documents (comprehensive SDS, product catalogs)
- Long presentations or white papers

**Section Detection Methods**:

1. **For SDS Documents** (16 standardized sections):
```
Section 1: Identification
Section 2: Hazard(s) identification
Section 3: Composition/information on ingredients
Section 4: First-aid measures
Section 5: Fire-fighting measures
Section 6: Accidental release measures
Section 7: Handling and storage
Section 8: Exposure controls/personal protection
Section 9: Physical and chemical properties
Section 10: Stability and reactivity
Section 11: Toxicological information
Section 12: Ecological information
Section 13: Disposal considerations
Section 14: Transport information
Section 15: Regulatory information
Section 16: Other information
```

2. **For PDFs with Table of Contents**:
   - Parse TOC structure
   - Split by major headings (H1, H2 level)
   - Preserve heading hierarchy in chunk metadata

3. **For Technical Specifications**:
   - Split by specification categories (Physical Properties, Chemical Properties, Applications)
   - Keep related parameters together (e.g., all density measurements in one chunk)

**Chunk Size Guidelines**:
```typescript
const chunkConfig = {
  target_tokens: 1000,        // Target size for optimal retrieval
  min_tokens: 800,            // Minimum viable chunk
  max_tokens: 1500,           // Hard limit (safety buffer for 8K context)
  overlap_tokens: 150,        // Context preservation between chunks
  preserve_sentences: true,   // Never split mid-sentence
  preserve_tables: true,      // Keep tables intact
  preserve_lists: true,       // Keep numbered/bulleted lists intact
};
```

**Implementation**:
```typescript
interface SectionChunk {
  chunk_id: string;
  document_id: string;
  chunk_index: number;         // 0, 1, 2, ...
  total_chunks: number;        // Total chunks in document
  chunk_text: string;
  chunk_type: 'section';
  section_title?: string;      // "Section 3: Composition" or "Physical Properties"
  section_number?: number;     // For ordered sections (SDS sections 1-16)
  parent_section?: string;     // For nested sections
  embedding_vector: number[];
}
```

### Strategy C: Metadata-Enhanced Chunking

**Concept**: Augment chunk text with contextual metadata for better embedding quality.

**Text Augmentation Pattern**:
```typescript
function augmentChunkText(chunk: string, metadata: DocumentMetadata): string {
  const prefix = `
Document: ${metadata.filename}
Supplier: ${metadata.supplier_name}
Ingredient: ${metadata.ingredient_name}
Type: ${metadata.document_type}

Content:
`;

  return prefix + chunk;
}
```

**Benefits**:
- Embeddings capture supplier and ingredient context
- Improves cross-document similarity (e.g., "BASF Vitamin E" vs "DSM Vitamin E")
- Enables ingredient-aware semantic search

**Trade-offs**:
- Increases token count (~50-100 tokens overhead)
- May dilute content-specific embeddings
- **Recommendation**: Use sparingly, rely more on metadata filtering

### Special Handling Cases

#### 1. Tables and Structured Data
```typescript
interface TableChunk {
  chunk_type: 'table';
  table_title?: string;
  table_data: {
    headers: string[];
    rows: string[][];
  };
  table_text_representation: string;  // Markdown format for embedding
  preserve_structure: true;
}
```

**Example: Specification Table**
```
| Parameter | Specification | Test Method |
|-----------|---------------|-------------|
| Appearance | White crystalline powder | Visual |
| Purity | ≥ 99.5% | HPLC |
| Melting Point | 42-44°C | USP <741> |
```

#### 2. Chemical Formulas and Nomenclature
- Preserve IUPAC names intact
- Keep CAS numbers with context
- Maintain molecular formulas (e.g., C10H20O)

#### 3. Multi-Language Documents
```typescript
interface MultiLangChunk {
  chunk_text_primary: string;    // English content
  chunk_text_secondary?: string;  // Thai/Chinese content
  language_primary: 'en';
  language_secondary?: 'th' | 'zh';
  translation_available: boolean;
}
```

#### 4. Image-Heavy Documents
- Extract text from image captions
- OCR embedded text in diagrams
- Store image references separately
- Consider future multi-modal embeddings

### Chunk Deduplication Strategy

**Problem**: Same content appears in multiple locations (current + Old folders, duplicates across suppliers)

**Solution**:
```typescript
function deduplicateChunks(chunks: Chunk[]): Chunk[] {
  const seen = new Map<string, Chunk>();

  for (const chunk of chunks) {
    const contentHash = computeHash(chunk.chunk_text);

    if (!seen.has(contentHash)) {
      seen.set(contentHash, chunk);
    } else {
      // Mark as duplicate, keep reference to canonical version
      const canonical = seen.get(contentHash);
      chunk.is_duplicate = true;
      chunk.canonical_chunk_id = canonical.chunk_id;

      // Store duplicate but don't embed
    }
  }

  return Array.from(seen.values());
}
```

---

## 3. METADATA SCHEMA

### Comprehensive Metadata Design

The metadata schema is the **most critical component** for high-precision retrieval. With 31K+ documents, comprehensive metadata enables powerful filtering that dramatically improves search relevance.

### Core Metadata Interface

```typescript
/**
 * Document metadata schema for cosmetics ingredient RAG system
 *
 * Design principles:
 * 1. Hierarchical structure (Supplier → Ingredient → Document)
 * 2. Multi-faceted classification (type, category, compliance)
 * 3. Version tracking and lifecycle management
 * 4. Search optimization (normalized fields, keywords, identifiers)
 * 5. Quality assurance (confidence scores, flags)
 */
interface DocumentMetadata {
  // ==========================================
  // IDENTITY & STORAGE
  // ==========================================
  document_id: string;              // UUID v4 (primary key)
  file_path: string;                // Original: "/Volumes/.../PC/BASF/Vitamin E/Spec.pdf"
  filename: string;                 // "Vitamin_E_Spec_06.24.pdf"
  file_hash: string;                // SHA-256 for deduplication & integrity
  file_size_bytes: number;          // File size
  file_extension: string;           // "pdf", "docx", "xlsx"

  // ==========================================
  // HIERARCHICAL CLASSIFICATION
  // (Key for filtering - indexed heavily)
  // ==========================================
  supplier_name: string;            // Original: "BASF", "ANHUI GREAT"
  supplier_normalized: string;      // Lowercase, trimmed: "basf", "anhui great"
  supplier_country?: string;        // Extracted from docs or manual entry

  ingredient_name: string;          // Original: "Menthol Crystal (Natural)"
  ingredient_normalized: string;    // Cleaned: "menthol crystal natural"
  ingredient_code?: string;         // Internal SKU/product code (if available)
  ingredient_inci_name?: string;    // INCI name: "MENTHOL"
  ingredient_cas_number?: string;   // Primary CAS: "89-78-1"

  // ==========================================
  // DOCUMENT CLASSIFICATION
  // ==========================================
  document_type: DocumentType;      // Enum (see below)
  document_category: DocumentCategory; // High-level grouping
  document_subtype?: string;        // Specific variant (e.g., "Halal MUI", "ISO9001")

  // ==========================================
  // VERSION CONTROL & LIFECYCLE
  // ==========================================
  version_date?: Date;              // Extracted from filename/content
  version_string?: string;          // "v2.3", "Rev 5", if available
  is_current: boolean;              // True if latest version (default: true)
  version_status: VersionStatus;    // Enum: current | archived | superseded
  superseded_by?: string;           // document_id of newer version
  supersedes?: string;              // document_id of older version

  // ==========================================
  // COMPLIANCE & CERTIFICATIONS
  // ==========================================
  compliance_types: string[];       // ["REACH", "Halal", "Vegan", "GMO-Free", "Kosher"]
  certification_bodies: string[];   // ["ISO", "FSSC22000", "BPJPH", "MUI", "HACCP"]
  regulatory_regions: string[];     // ["EU", "US", "ASEAN", "Global", "Thailand"]
  expiry_date?: Date;               // For time-limited certificates
  issue_date?: Date;                // Certificate issue date
  certification_number?: string;    // Cert ID (e.g., "BPJPH-12345")

  // ==========================================
  // CONTENT PROPERTIES
  // ==========================================
  language: string;                 // ISO 639-1: "en", "th", "zh"
  languages_detected: string[];     // For multi-language docs: ["en", "th"]
  has_images: boolean;
  has_tables: boolean;
  has_chemical_formulas: boolean;
  has_diagrams: boolean;
  page_count: number;
  word_count: number;

  // ==========================================
  // PROCESSING METADATA
  // ==========================================
  extraction_method: ExtractionMethod; // "docling" | "mistral_ocr" | "manual"
  ocr_confidence?: number;          // 0.0-1.0 (if OCR was used)
  ocr_quality_flags?: string[];     // ["low_confidence_tables", "skewed_text"]
  processed_date: Date;             // When vectorization completed
  processing_duration_ms?: number;  // Time taken to process
  text_length: number;              // Character count
  token_count: number;              // Estimated tokens (for chunking decisions)

  // ==========================================
  // SEARCH OPTIMIZATION
  // ==========================================
  keywords: string[];               // Extracted: ["menthol", "cooling", "mint", "natural"]
  cas_numbers: string[];            // All CAS numbers found: ["89-78-1", "1490-04-6"]
  inci_names: string[];             // All INCI names: ["MENTHOL", "MENTHYL LACTATE"]
  allergens: string[];              // Detected allergens: ["tree nuts", "none"]
  ec_numbers: string[];             // EC Numbers: ["201-939-0"]
  chemical_names: string[];         // ["L-Menthol", "2-Isopropyl-5-methylcyclohexanol"]

  // ==========================================
  // BUSINESS CONTEXT
  // ==========================================
  product_applications: string[];   // ["skincare", "haircare", "oral_care", "fragrance"]
  function_categories: string[];    // ["cooling_agent", "fragrance", "antimicrobial"]
  cosmetic_categories: string[];    // ["leave_on", "rinse_off", "color_cosmetics"]
  batch_numbers: string[];          // From COA: ["20C05A05a", "2024031001"]
  lot_numbers: string[];            // Alternative to batch_numbers

  // ==========================================
  // QUALITY FLAGS & VALIDATION
  // ==========================================
  quality_score: number;            // 0.0-1.0 composite score
  quality_dimensions: {
    ocr_confidence: number;         // If applicable
    metadata_completeness: number;  // % of optional fields filled
    content_clarity: number;        // Readability metrics
    structural_integrity: number;   // Tables/formatting preserved
  };

  is_duplicate: boolean;
  duplicate_of?: string;            // document_id of canonical version
  duplicate_reason?: string;        // "identical_hash" | "semantic_similarity"

  requires_review: boolean;         // Flag for manual QA
  review_notes?: string;            // Admin notes
  validation_status: ValidationStatus; // verified | pending | failed

  // ==========================================
  // CUSTOM FLAGS & NOTES
  // ==========================================
  is_discontinued: boolean;         // Product no longer available
  discontinuation_date?: Date;
  special_notes?: string;           // From folder names, Thai text, etc.
  internal_notes?: string;          // Private notes (not searchable)

  // ==========================================
  // TECHNICAL SPECIFICATIONS (for Spec docs)
  // ==========================================
  specifications?: {
    appearance?: string;
    odor?: string;
    color?: string;
    form?: string;               // "powder", "liquid", "crystal"
    purity?: string;
    ph?: string;
    density?: string;
    melting_point?: string;
    boiling_point?: string;
    solubility?: string;
  };

  // ==========================================
  // TIMESTAMPS
  // ==========================================
  created_at: Date;                 // When record was created
  updated_at: Date;                 // Last modification
  indexed_at?: Date;                // When added to vector DB
  last_accessed?: Date;             // For usage analytics
}
```

### Enumerations

```typescript
/**
 * Document type classification based on filename patterns and content analysis
 */
enum DocumentType {
  // Safety & Regulatory
  SDS = 'sds',                              // Safety Data Sheet
  MSDS = 'msds',                            // Material Safety Data Sheet (legacy term)

  // Technical Documentation
  SPEC = 'specification',                    // Technical Specification
  TDS = 'technical_data_sheet',             // Technical Data Sheet
  COA = 'certificate_of_analysis',          // Batch testing results

  // Compliance Statements
  REACH = 'reach_registration',             // EU REACH compliance
  CERT_HALAL = 'halal_certificate',         // Halal certification
  CERT_KOSHER = 'kosher_certificate',       // Kosher certification
  CERT_ISO = 'iso_certificate',             // ISO certifications (9001, 22000, etc.)
  CERT_FSSC = 'fssc_certificate',           // FSSC 22000
  CERT_HACCP = 'haccp_certificate',         // HACCP
  CERT_GMP = 'gmp_certificate',             // Good Manufacturing Practice

  // Ingredient Statements
  COMPOSITION = 'composition_sheet',         // Ingredient breakdown
  ALLERGEN = 'allergen_statement',          // Allergen information
  GMO = 'gmo_statement',                    // GMO status
  VEGAN = 'vegan_statement',                // Vegan/animal-derived status
  PALM_FREE = 'palm_free_statement',        // Palm oil content
  ANIMAL_TESTING = 'animal_testing_statement', // Animal testing policy
  NATURALNESS = 'naturalness_statement',    // Natural/synthetic origin

  // Manufacturing & Process
  MANUFACTURING = 'manufacturing_procedure', // Production process
  FLOW_CHART = 'process_flow_chart',        // Process diagram

  // Marketing & Product Info
  PRESENTATION = 'product_presentation',     // Marketing slides
  CATALOG = 'product_catalog',              // Product portfolio
  PRODUCT_PROFILE = 'product_profile',      // Product overview
  APPLICATION_GUIDE = 'application_guide',   // Usage instructions

  // Regulatory
  REGULATORY = 'regulatory_document',        // General regulatory docs
  PROPOSITION_65 = 'proposition_65',        // California Prop 65
  COUNTRY_ORIGIN = 'country_of_origin',     // Origin statement

  // Other
  EMAIL = 'email',                          // Correspondence (.msg files)
  IMAGE = 'image',                          // Product images, diagrams
  OTHER = 'other',                          // Uncategorized
}

/**
 * High-level document categorization
 */
enum DocumentCategory {
  SAFETY = 'safety',                 // SDS, MSDS, hazard info
  TECHNICAL = 'technical',           // Spec, TDS, COA
  COMPLIANCE = 'compliance',         // REACH, statements, certifications
  MARKETING = 'marketing',           // Presentations, catalogs
  MANUFACTURING = 'manufacturing',   // Process docs, flow charts
  REGULATORY = 'regulatory',         // Regional regulatory docs
  COMMUNICATION = 'communication',   // Emails, correspondence
}

/**
 * Version lifecycle status
 */
enum VersionStatus {
  CURRENT = 'current',               // Latest active version
  ARCHIVED = 'archived',             // Old version (in "Old" folder)
  SUPERSEDED = 'superseded',         // Replaced by newer version
  DRAFT = 'draft',                   // Not yet finalized
}

/**
 * Extraction method used
 */
enum ExtractionMethod {
  DOCLING = 'docling',               // Primary: Docling library
  MISTRAL_OCR = 'mistral_ocr',       // Fallback: Mistral OCR API
  MANUAL = 'manual',                 // Manual data entry
  HYBRID = 'hybrid',                 // Combination of methods
}

/**
 * Validation status for quality control
 */
enum ValidationStatus {
  VERIFIED = 'verified',             // Manually verified as accurate
  PENDING = 'pending',               // Awaiting review
  FAILED = 'failed',                 // Failed validation checks
  AUTO_VALIDATED = 'auto_validated', // Passed automated checks
}
```

### Metadata Field Priority & Indexing Strategy

**Critical Fields** (Always indexed, heavily used in filtering):
- `supplier_normalized`
- `ingredient_normalized`
- `document_type`
- `is_current`
- `is_discontinued`
- `compliance_types`
- `expiry_date`

**Important Fields** (Indexed, moderately used):
- `document_category`
- `keywords`
- `cas_numbers`
- `inci_names`
- `regulatory_regions`
- `quality_score`

**Optional Fields** (Not indexed, used for display/enrichment):
- `internal_notes`
- `processing_duration_ms`
- `specifications.*`

---

## 4. METADATA EXTRACTION PIPELINE

### Automated Extraction Rules

The metadata extraction pipeline combines file path parsing, filename analysis, and content extraction to populate the comprehensive metadata schema.

### Phase 1: File Path Parsing

```typescript
/**
 * Extract hierarchical structure from file path
 * Pattern: /PC/{Supplier}/{Ingredient}/{...}/{Filename}
 */
function parseFilePath(filePath: string): Partial<DocumentMetadata> {
  const pathPattern = /\/PC\/([^\/]+)\/([^\/]+)\/(.+)/;
  const match = filePath.match(pathPattern);

  if (!match) {
    throw new Error(`Invalid path structure: ${filePath}`);
  }

  const [_, supplier, ingredient, restPath] = match;
  const filename = path.basename(restPath);

  return {
    file_path: filePath,
    filename,
    file_extension: path.extname(filename).slice(1).toLowerCase(),
    supplier_name: supplier.trim(),
    supplier_normalized: normalizeString(supplier),
    ingredient_name: ingredient.trim(),
    ingredient_normalized: normalizeString(ingredient),
  };
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .replace(/[_\-]+/g, ' ')           // Convert underscores/hyphens to spaces
    .replace(/\([^)]*\)/g, '')         // Remove parenthetical notes
    .replace(/[^\w\s]/g, '')           // Remove special chars
    .trim();
}
```

### Phase 2: Document Type Classification

```typescript
/**
 * Classify document type from filename
 * Priority order matters - more specific patterns first
 */
function classifyDocumentType(filename: string): DocumentType {
  const normalizedName = filename.toLowerCase();

  // Type detection patterns (order matters - specific before general)
  const typePatterns: Record<DocumentType, RegExp[]> = {
    [DocumentType.SDS]: [/\bsds\b/, /safety.*data.*sheet/],
    [DocumentType.MSDS]: [/\bmsds\b/, /material.*safety/],
    [DocumentType.COA]: [/\bcoa\b/, /certificate.*of.*analysis/],
    [DocumentType.SPEC]: [/\bspec\b/, /specification/],
    [DocumentType.TDS]: [/\btds\b/, /technical.*data.*sheet/],

    // Certifications (specific types)
    [DocumentType.CERT_HALAL]: [/\bhalal\b/, /halal.*cert/],
    [DocumentType.CERT_KOSHER]: [/\bkosher\b/, /kosher.*cert/],
    [DocumentType.CERT_ISO]: [/\biso\s*\d{4,5}\b/i, /iso.*cert/],
    [DocumentType.CERT_FSSC]: [/\bfssc\b/, /fssc.*22000/],
    [DocumentType.CERT_HACCP]: [/\bhaccp\b/],
    [DocumentType.CERT_GMP]: [/\bgmp\b/, /good.*manufacturing/],

    // Compliance
    [DocumentType.REACH]: [/\breach\b/],
    [DocumentType.GMO]: [/\bgmo\b/, /gmo.*free/, /non.*gmo/],
    [DocumentType.VEGAN]: [/\bvegan\b/],
    [DocumentType.ALLERGEN]: [/\ballergen/],
    [DocumentType.PALM_FREE]: [/\bpalm.*free\b/, /palm.*oil.*free/],
    [DocumentType.ANIMAL_TESTING]: [/animal.*test/, /cruelty.*free/],
    [DocumentType.NATURALNESS]: [/natural.*statement/, /synthetic.*statement/],

    // Process
    [DocumentType.COMPOSITION]: [/\bcomposition\b/, /ingredient.*list/],
    [DocumentType.MANUFACTURING]: [/manufacturing.*procedure/, /production.*process/],
    [DocumentType.FLOW_CHART]: [/flow.*chart/, /process.*flow/],

    // Marketing
    [DocumentType.PRESENTATION]: [/presentation/, /product.*catalog/],
    [DocumentType.CATALOG]: [/catalog/, /brochure/],
    [DocumentType.PRODUCT_PROFILE]: [/product.*profile/, /product.*overview/],

    // Other
    [DocumentType.COUNTRY_ORIGIN]: [/country.*of.*origin/, /origin.*statement/],
    [DocumentType.PROPOSITION_65]: [/proposition.*65/, /prop.*65/],
    [DocumentType.EMAIL]: [/\.msg$/],
    [DocumentType.IMAGE]: [/\.(jpg|jpeg|png|gif|bmp|tif|tiff)$/],
  };

  // Check patterns in priority order
  for (const [type, patterns] of Object.entries(typePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedName)) {
        return type as DocumentType;
      }
    }
  }

  return DocumentType.OTHER;
}

/**
 * Derive document category from type
 */
function deriveCategory(type: DocumentType): DocumentCategory {
  const categoryMap: Record<DocumentType, DocumentCategory> = {
    [DocumentType.SDS]: DocumentCategory.SAFETY,
    [DocumentType.MSDS]: DocumentCategory.SAFETY,
    [DocumentType.SPEC]: DocumentCategory.TECHNICAL,
    [DocumentType.TDS]: DocumentCategory.TECHNICAL,
    [DocumentType.COA]: DocumentCategory.TECHNICAL,
    [DocumentType.REACH]: DocumentCategory.COMPLIANCE,
    [DocumentType.CERT_HALAL]: DocumentCategory.COMPLIANCE,
    [DocumentType.CERT_KOSHER]: DocumentCategory.COMPLIANCE,
    [DocumentType.CERT_ISO]: DocumentCategory.COMPLIANCE,
    // ... (map all types)
  };

  return categoryMap[type] || DocumentCategory.REGULATORY;
}
```

### Phase 3: Version & Date Extraction

```typescript
/**
 * Extract version dates from filename
 * Handles multiple date formats found in the dataset
 */
function extractVersionDate(filename: string): Date | null {
  const datePatterns = [
    // DD.MM.YYYY or DD.MM.YY
    { pattern: /(\d{2})\.(\d{2})\.(\d{2,4})/, format: 'DD.MM.YYYY' },
    // MM.YY
    { pattern: /_(\d{2})\.(\d{2})(?:\.pdf)?$/i, format: 'MM.YY' },
    // YYYY-MM-DD
    { pattern: /(\d{4})-(\d{2})-(\d{2})/, format: 'YYYY-MM-DD' },
    // YYYYMMDD
    { pattern: /_(\d{4})(\d{2})(\d{2})/, format: 'YYYYMMDD' },
    // (DD.MM.YYYY) in parentheses
    { pattern: /\((\d{2})\.(\d{2})\.(\d{4})\)/, format: '(DD.MM.YYYY)' },
  ];

  for (const { pattern, format } of datePatterns) {
    const match = filename.match(pattern);
    if (match) {
      return parseDateByFormat(match, format);
    }
  }

  return null;
}

function parseDateByFormat(match: RegExpMatchArray, format: string): Date {
  switch (format) {
    case 'DD.MM.YYYY':
      const [_, day, month, year] = match;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return new Date(`${fullYear}-${month}-${day}`);

    case 'MM.YY':
      const [__, mm, yy] = match;
      return new Date(`20${yy}-${mm}-01`);

    case 'YYYYMMDD':
      const [___, yyyy, mm2, dd] = match;
      return new Date(`${yyyy}-${mm2}-${dd}`);

    // ... handle other formats
  }
}

/**
 * Extract expiry date for certificates
 * Pattern: "EXP.DD.MM.YY" or "EXP_YYYY.MM.DD"
 */
function extractExpiryDate(filename: string): Date | null {
  const expiryPatterns = [
    /EXP[._](\d{2})\.(\d{2})\.(\d{2,4})/i,
    /EXP[._](\d{4})\.(\d{2})\.(\d{2})/i,
    /expiry[._](\d{2})[._](\d{2})[._](\d{2,4})/i,
  ];

  for (const pattern of expiryPatterns) {
    const match = filename.match(pattern);
    if (match) {
      // Parse based on matched groups
      return parseExpiryDate(match);
    }
  }

  return null;
}
```

### Phase 4: Compliance Type Detection

```typescript
/**
 * Detect compliance types from filename and later from content
 */
function detectComplianceTypes(filename: string): string[] {
  const types: string[] = [];
  const lowerFilename = filename.toLowerCase();

  const compliancePatterns: Record<string, RegExp> = {
    'REACH': /\breach\b/,
    'Halal': /\bhalal\b/,
    'Kosher': /\bkosher\b/,
    'Vegan': /\bvegan\b/,
    'GMO-Free': /\bgmo.*free\b|non.*gmo/,
    'Gluten-Free': /gluten.*free/,
    'Palm-Free': /palm.*free/,
    'Allergen-Free': /allergen.*free/,
    'Cruelty-Free': /cruelty.*free|no.*animal.*test/,
    'Natural': /\bnatural\b/,
    'Organic': /\borganic\b/,
  };

  for (const [type, pattern] of Object.entries(compliancePatterns)) {
    if (pattern.test(lowerFilename)) {
      types.push(type);
    }
  }

  return types;
}
```

### Phase 5: Version Status Detection

```typescript
/**
 * Determine if document is current, archived, or superseded
 */
function determineVersionStatus(filePath: string): VersionStatus {
  const lowerPath = filePath.toLowerCase();

  // Check if in "Old", "old", "Archive", "Archived" folder
  if (lowerPath.includes('/old/') ||
      lowerPath.includes('/- old/') ||
      lowerPath.includes('/archive/')) {
    return VersionStatus.ARCHIVED;
  }

  // Check for "deprecated", "obsolete" in filename
  if (lowerPath.includes('deprecated') ||
      lowerPath.includes('obsolete') ||
      lowerPath.includes('superseded')) {
    return VersionStatus.SUPERSEDED;
  }

  // Default to current
  return VersionStatus.CURRENT;
}
```

### Phase 6: Special Flags Detection

```typescript
/**
 * Detect special conditions from folder/file names
 */
function detectSpecialFlags(filePath: string): Partial<DocumentMetadata> {
  const flags: Partial<DocumentMetadata> = {};

  // Discontinued products
  if (filePath.includes('Discontinued') ||
      filePath.includes('ยกเลิกการขาย') ||  // Thai: "cancelled sale"
      filePath.includes('_Discontinued')) {
    flags.is_discontinued = true;

    // Try to extract discontinuation date
    const dateMatch = filePath.match(/(?:Discontinued|ยกเลิกการขาย)[_ ](\d{2})\.(\d{2})\.(\d{4})/);
    if (dateMatch) {
      flags.discontinuation_date = new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
    }
  }

  // Special notes (Thai text, unusual markers)
  const thaiTextMatch = filePath.match(/[\u0E00-\u0E7F]+/);
  if (thaiTextMatch) {
    flags.special_notes = `Contains Thai text: ${thaiTextMatch[0]}`;
  }

  return flags;
}
```

### Phase 7: Content-Based Extraction (After Text Extraction)

```typescript
/**
 * Extract metadata from document content (post-OCR/extraction)
 */
async function extractContentMetadata(
  text: string,
  documentType: DocumentType
): Promise<Partial<DocumentMetadata>> {
  const metadata: Partial<DocumentMetadata> = {};

  // CAS Number extraction (format: 12345-67-8)
  const casPattern = /\b\d{2,7}-\d{2}-\d\b/g;
  const casNumbers = [...new Set(text.match(casPattern) || [])];
  if (casNumbers.length > 0) {
    metadata.cas_numbers = casNumbers;
  }

  // EC Number extraction (format: 201-939-0)
  const ecPattern = /\b\d{3}-\d{3}-\d\b/g;
  const ecNumbers = [...new Set(text.match(ecPattern) || [])];
  if (ecNumbers.length > 0) {
    metadata.ec_numbers = ecNumbers;
  }

  // Batch/Lot number extraction (from COA)
  if (documentType === DocumentType.COA) {
    const batchPatterns = [
      /(?:Lot|Batch|Lot No\.?|Batch No\.?)[:\s]+([A-Z0-9]+)/gi,
      /\bLot[:\s]+([A-Z0-9]{6,})/gi,
    ];

    const batches: string[] = [];
    for (const pattern of batchPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        batches.push(match[1]);
      }
    }

    if (batches.length > 0) {
      metadata.batch_numbers = [...new Set(batches)];
    }
  }

  // Allergen detection
  const allergenKeywords = [
    'peanut', 'tree nut', 'milk', 'egg', 'fish', 'shellfish',
    'soy', 'wheat', 'sesame', 'gluten', 'lactose'
  ];

  const foundAllergens: string[] = [];
  const lowerText = text.toLowerCase();
  for (const allergen of allergenKeywords) {
    if (lowerText.includes(allergen)) {
      foundAllergens.push(allergen);
    }
  }

  if (foundAllergens.length > 0) {
    metadata.allergens = foundAllergens;
  } else if (lowerText.includes('allergen free') || lowerText.includes('no allergens')) {
    metadata.allergens = ['none'];
  }

  // Language detection
  metadata.language = detectLanguage(text);

  // Has tables/formulas detection
  metadata.has_tables = containsTables(text);
  metadata.has_chemical_formulas = containsChemicalFormulas(text);

  return metadata;
}

function detectLanguage(text: string): string {
  // Simple heuristic (can be improved with language detection library)
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g);
  const chineseChars = text.match(/[\u4E00-\u9FFF]/g);
  const englishChars = text.match(/[a-zA-Z]/g);

  if (thaiChars && thaiChars.length > (text.length * 0.1)) return 'th';
  if (chineseChars && chineseChars.length > (text.length * 0.1)) return 'zh';
  return 'en';
}

function containsTables(text: string): boolean {
  // Check for table-like patterns (multiple tabs/pipes in lines)
  const lines = text.split('\n');
  let tableLines = 0;

  for (const line of lines) {
    if (line.includes('\t\t') || line.match(/\|[^|]+\|[^|]+\|/)) {
      tableLines++;
    }
  }

  return tableLines > 3;
}

function containsChemicalFormulas(text: string): boolean {
  // Check for chemical formula patterns (C10H20O, H2SO4, etc.)
  const chemicalPattern = /\b[A-Z][a-z]?\d+(?:[A-Z][a-z]?\d+)*\b/g;
  const matches = text.match(chemicalPattern);
  return matches !== null && matches.length > 5;
}
```

---

## 5. PROCESSING ARCHITECTURE

### Overview

The processing pipeline consists of 4 major phases executed over 4 weeks:
1. **Phase 1: Document Discovery & Inventory** (Days 1-7)
2. **Phase 2: Text Extraction** (Days 8-14)
3. **Phase 3: Vectorization & Indexing** (Days 15-21)
4. **Phase 4: API Integration & Testing** (Days 22-28)

### Phase 1: Document Discovery & Inventory (Week 1)

**Goal**: Catalog all 31,749 files, extract basic metadata from paths/filenames, detect duplicates, and map version relationships.

#### Step 1.1: File System Scan (Day 1-2)

```typescript
/**
 * Recursively scan the PC directory and build initial inventory
 */
interface FileInventoryEntry {
  file_path: string;
  filename: string;
  file_size: number;
  file_extension: string;
  created_at: Date;
  modified_at: Date;
  file_hash?: string;  // Computed later
}

async function scanDirectory(rootPath: string): Promise<FileInventoryEntry[]> {
  const inventory: FileInventoryEntry[] = [];

  async function traverse(dirPath: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);

        inventory.push({
          file_path: fullPath,
          filename: entry.name,
          file_size: stats.size,
          file_extension: path.extname(entry.name).slice(1).toLowerCase(),
          created_at: stats.birthtime,
          modified_at: stats.mtime,
        });
      }
    }
  }

  await traverse(rootPath);
  return inventory;
}

// Execute scan
const PC_ROOT = '/Volumes/Untitled/Catalite/PC';
const inventory = await scanDirectory(PC_ROOT);

console.log(`Discovered ${inventory.length} files`);
// Store in temporary staging database
await db.bulkInsert('file_inventory_staging', inventory);
```

#### Step 1.2: Metadata Extraction from Paths (Day 3-4)

```typescript
/**
 * Process inventory to extract metadata from file paths and names
 */
async function processInventoryMetadata() {
  const files = await db.query('SELECT * FROM file_inventory_staging');
  const processed: Partial<DocumentMetadata>[] = [];

  for (const file of files.rows) {
    try {
      // Extract hierarchical structure
      const pathMeta = parseFilePath(file.file_path);

      // Classify document type
      const docType = classifyDocumentType(file.filename);
      const docCategory = deriveCategory(docType);

      // Extract dates
      const versionDate = extractVersionDate(file.filename);
      const expiryDate = extractExpiryDate(file.filename);

      // Detect compliance types
      const complianceTypes = detectComplianceTypes(file.filename);

      // Determine version status
      const versionStatus = determineVersionStatus(file.file_path);
      const isCurrent = versionStatus === VersionStatus.CURRENT;

      // Special flags
      const specialFlags = detectSpecialFlags(file.file_path);

      const metadata: Partial<DocumentMetadata> = {
        document_id: crypto.randomUUID(),
        ...pathMeta,
        document_type: docType,
        document_category: docCategory,
        version_date: versionDate,
        expiry_date: expiryDate,
        compliance_types: complianceTypes,
        version_status: versionStatus,
        is_current: isCurrent,
        ...specialFlags,
        file_size_bytes: file.file_size,
        created_at: new Date(),
        updated_at: new Date(),
        validation_status: ValidationStatus.PENDING,
      };

      processed.push(metadata);

    } catch (error) {
      console.error(`Error processing ${file.file_path}:`, error);
      // Log error but continue
    }
  }

  // Bulk insert into main documents table
  await db.bulkInsert('documents', processed);

  console.log(`Processed metadata for ${processed.length} documents`);
}
```

#### Step 1.3: Duplicate Detection (Day 5)

```typescript
/**
 * Detect duplicate files using hash comparison
 * Strategy: Hash files in batches to avoid memory issues
 */
async function detectDuplicates() {
  const BATCH_SIZE = 1000;
  const documents = await db.query(`
    SELECT document_id, file_path, file_size_bytes
    FROM documents
    WHERE file_hash IS NULL
    ORDER BY file_size_bytes DESC
  `);

  // Process in batches
  for (let i = 0; i < documents.rows.length; i += BATCH_SIZE) {
    const batch = documents.rows.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (doc) => {
      try {
        // Compute SHA-256 hash
        const hash = await computeFileHash(doc.file_path);

        // Update document with hash
        await db.query(`
          UPDATE documents
          SET file_hash = $1
          WHERE document_id = $2
        `, [hash, doc.document_id]);

      } catch (error) {
        console.error(`Failed to hash ${doc.file_path}:`, error);
      }
    }));

    console.log(`Hashed ${Math.min(i + BATCH_SIZE, documents.rows.length)} / ${documents.rows.length} files`);
  }

  // Find duplicates
  const duplicates = await db.query(`
    WITH hash_groups AS (
      SELECT
        file_hash,
        array_agg(document_id ORDER BY file_path) as doc_ids,
        count(*) as dup_count
      FROM documents
      WHERE file_hash IS NOT NULL
      GROUP BY file_hash
      HAVING count(*) > 1
    )
    SELECT * FROM hash_groups;
  `);

  // Mark duplicates (keep first as canonical)
  for (const group of duplicates.rows) {
    const [canonical, ...dups] = group.doc_ids;

    await db.query(`
      UPDATE documents
      SET
        is_duplicate = true,
        duplicate_of = $1,
        duplicate_reason = 'identical_hash'
      WHERE document_id = ANY($2::uuid[])
    `, [canonical, dups]);
  }

  console.log(`Found ${duplicates.rows.length} duplicate groups`);
}

async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

#### Step 1.4: Version Mapping (Day 6-7)

```typescript
/**
 * Map relationships between current and archived versions
 * Strategy: Group by supplier + ingredient + document_type, compare dates
 */
async function mapVersionRelationships() {
  // Find groups of documents that are likely different versions
  const versionGroups = await db.query(`
    SELECT
      supplier_normalized,
      ingredient_normalized,
      document_type,
      array_agg(document_id ORDER BY version_date DESC NULLS LAST) as versions,
      array_agg(version_date ORDER BY version_date DESC NULLS LAST) as dates,
      array_agg(version_status ORDER BY version_date DESC NULLS LAST) as statuses
    FROM documents
    WHERE is_duplicate = false
    GROUP BY supplier_normalized, ingredient_normalized, document_type
    HAVING count(*) > 1
  `);

  for (const group of versionGroups.rows) {
    const versions = group.versions;
    const statuses = group.statuses;

    // First non-archived version is current
    let currentIdx = statuses.findIndex(s => s !== 'archived');
    if (currentIdx === -1) currentIdx = 0; // Fallback to newest

    const currentDocId = versions[currentIdx];

    // Mark current version
    await db.query(`
      UPDATE documents
      SET is_current = true, version_status = 'current'
      WHERE document_id = $1
    `, [currentDocId]);

    // Mark others as superseded and link
    for (let i = 0; i < versions.length; i++) {
      if (i !== currentIdx) {
        await db.query(`
          UPDATE documents
          SET
            is_current = false,
            version_status = CASE
              WHEN version_status = 'archived' THEN 'archived'
              ELSE 'superseded'
            END,
            superseded_by = $1
          WHERE document_id = $2
        `, [currentDocId, versions[i]]);
      }
    }
  }

  console.log(`Mapped ${versionGroups.rows.length} version groups`);
}
```

#### Step 1.5: Inventory Report Generation (Day 7)

```typescript
/**
 * Generate comprehensive inventory report for review
 */
async function generateInventoryReport() {
  const stats = await db.query(`
    SELECT
      COUNT(*) as total_docs,
      COUNT(DISTINCT supplier_normalized) as total_suppliers,
      COUNT(DISTINCT ingredient_normalized) as total_ingredients,
      SUM(CASE WHEN is_current THEN 1 ELSE 0 END) as current_docs,
      SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) as duplicate_docs,
      SUM(CASE WHEN is_discontinued THEN 1 ELSE 0 END) as discontinued_docs,
      SUM(CASE WHEN version_status = 'archived' THEN 1 ELSE 0 END) as archived_docs
    FROM documents
  `);

  const byType = await db.query(`
    SELECT
      document_type,
      COUNT(*) as count,
      COUNT(CASE WHEN is_current THEN 1 END) as current_count
    FROM documents
    WHERE is_duplicate = false
    GROUP BY document_type
    ORDER BY count DESC
  `);

  const bySupplier = await db.query(`
    SELECT
      supplier_name,
      COUNT(DISTINCT ingredient_normalized) as ingredient_count,
      COUNT(*) as document_count
    FROM documents
    WHERE is_duplicate = false AND is_current = true
    GROUP BY supplier_name
    ORDER BY document_count DESC
    LIMIT 20
  `);

  const report = {
    summary: stats.rows[0],
    by_type: byType.rows,
    top_suppliers: bySupplier.rows,
    generated_at: new Date().toISOString(),
  };

  await fs.writeFile(
    './reports/inventory_report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('Inventory Report Generated:');
  console.log(JSON.stringify(stats.rows[0], null, 2));
}
```

---

**End of Part 1**

This completes the first part of the implementation plan covering:
- Comprehensive folder structure analysis with real examples
- Detailed chunking strategies for different document types
- Complete metadata schema with 25+ fields
- Metadata extraction pipeline with pattern matching
- Phase 1 of processing architecture (Discovery & Inventory)

**Continue to Part 2** for:
- Phase 2: Text Extraction (Docling integration)
- Phase 3: Vectorization & Indexing
- Vector database schema and setup
- Embedding generation with AWS Titan v2

**Continue to Part 3** for:
- Phase 4: API Integration
- Next.js API routes implementation
- RAG chatbot endpoint
- Search strategies and optimization
- Cost estimation and timeline
