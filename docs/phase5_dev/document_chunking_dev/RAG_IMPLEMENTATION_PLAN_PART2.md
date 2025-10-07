# RAG Document Vectorization Implementation Plan - Part 2
## Text Extraction, Vectorization & Database Setup

**Continuation from Part 1** - This document covers the core processing phases: text extraction, embeddings generation, and vector database configuration.

---

## TABLE OF CONTENTS - PART 2

6. [Text Extraction Phase (Docling + Mistral OCR)](#6-text-extraction-phase)
7. [Vector Database Setup (pgvector)](#7-vector-database-setup)
8. [Embedding Generation (AWS Titan v2)](#8-embedding-generation)
9. [Vectorization & Indexing Phase](#9-vectorization--indexing-phase)
10. [Retrieval Strategy (Hybrid Search)](#10-retrieval-strategy)

---

## 6. TEXT EXTRACTION PHASE

### Phase 2: Text Extraction (Week 2, Days 8-14)

**Goal**: Extract clean, structured text from all 30,208 processable documents using Docling as primary method and Mistral OCR as fallback.

### 6.1 Tool Selection: Docling vs Mistral OCR

#### Why Docling (Primary Choice)

**Advantages**:
1. **Superior Table Extraction**: Critical for specifications, COA, composition sheets
2. **Chemical Formula Recognition**: Better handling of IUPAC names, molecular formulas
3. **Layout Analysis**: Understands multi-column layouts common in technical docs
4. **Local Processing**: No API rate limits, full control over processing
5. **Cost**: Open-source, only compute costs (~$0.50/hour on modest GPU)
6. **Batch Processing**: Can process thousands of files efficiently

**Installation & Setup**:
```bash
# Install Docling
pip install docling

# Optional: GPU acceleration for faster processing
pip install docling[gpu]

# Dependencies
pip install python-docx  # For DOCX files
pip install openpyxl     # For Excel files
pip install python-pptx  # For PowerPoint
```

**Basic Usage**:
```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()

# Convert PDF
result = converter.convert("/path/to/document.pdf")

# Access extracted content
text = result.document.export_to_markdown()
tables = result.document.tables
images = result.document.pictures
```

#### When to Use Mistral OCR (Fallback)

**Use cases**:
1. Scanned documents with low-quality text
2. Image-heavy PDFs where Docling fails
3. Documents with complex layouts that Docling can't parse
4. Handwritten or annotated documents

**Advantages**:
- State-of-the-art OCR accuracy
- Multi-language support (English, Thai, Chinese)
- Handles skewed/rotated text
- Batch API available

**Cost**:
- Batch processing API: More cost-effective than real-time
- Estimated: $0.001-0.003 per page
- For 30K docs (~150K pages avg): ~$150-450

### 6.2 Docling Integration Architecture

```python
"""
Text extraction service using Docling with Mistral OCR fallback
"""
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.document_converter import DocumentConverter

@dataclass
class ExtractionResult:
    """Structured result from document extraction"""
    document_id: str
    success: bool
    text_content: str
    tables: list[dict]
    images: list[dict]
    metadata: dict
    extraction_method: str
    ocr_confidence: Optional[float] = None
    error: Optional[str] = None
    processing_time_ms: int = 0


class DocumentExtractor:
    """
    Multi-method document extraction service
    Primary: Docling
    Fallback: Mistral OCR
    """

    def __init__(self, mistral_api_key: Optional[str] = None):
        # Initialize Docling converter
        self.converter = DocumentConverter()

        # Mistral OCR client (optional)
        self.mistral_client = None
        if mistral_api_key:
            from mistralai.client import MistralClient
            self.mistral_client = MistralClient(api_key=mistral_api_key)

        # Processing statistics
        self.stats = {
            'total_processed': 0,
            'docling_success': 0,
            'mistral_fallback': 0,
            'failures': 0,
        }


    async def extract_document(
        self,
        file_path: str,
        document_id: str,
        document_type: str,
    ) -> ExtractionResult:
        """
        Extract text and metadata from a document
        """
        start_time = time.time()

        try:
            # Try Docling first
            result = await self._extract_with_docling(
                file_path,
                document_id,
                document_type
            )

            if result.success:
                self.stats['docling_success'] += 1
                return result

            # Fallback to Mistral OCR if Docling fails
            if self.mistral_client:
                result = await self._extract_with_mistral(
                    file_path,
                    document_id
                )

                if result.success:
                    self.stats['mistral_fallback'] += 1
                    return result

            # Both methods failed
            self.stats['failures'] += 1
            return result

        except Exception as e:
            self.stats['failures'] += 1
            return ExtractionResult(
                document_id=document_id,
                success=False,
                text_content='',
                tables=[],
                images=[],
                metadata={},
                extraction_method='none',
                error=str(e),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )


    async def _extract_with_docling(
        self,
        file_path: str,
        document_id: str,
        document_type: str,
    ) -> ExtractionResult:
        """
        Primary extraction method using Docling
        """
        try:
            # Configure format-specific options
            format_options = {}

            if file_path.endswith('.pdf'):
                # PDF-specific settings
                format_options[InputFormat.PDF] = PdfFormatOption(
                    pipeline_options={
                        'do_table_structure': True,  # Extract tables
                        'do_ocr': True,              # Fallback OCR for images
                    }
                )

            # Convert document
            result = self.converter.convert(
                file_path,
                **format_options
            )

            # Extract content
            markdown_text = result.document.export_to_markdown()

            # Extract tables
            tables = []
            for table in result.document.tables:
                tables.append({
                    'data': table.export_to_dataframe().to_dict(),
                    'text': table.export_to_markdown(),
                    'num_rows': len(table.data),
                    'num_cols': len(table.data[0]) if table.data else 0,
                })

            # Extract images metadata
            images = []
            for img in result.document.pictures:
                images.append({
                    'caption': getattr(img, 'caption', ''),
                    'bbox': getattr(img, 'bbox', None),
                })

            # Analyze content quality
            has_tables = len(tables) > 0
            has_images = len(images) > 0
            has_formulas = self._detect_chemical_formulas(markdown_text)

            # Estimate token count
            token_count = len(markdown_text.split()) * 1.3  # Rough estimate

            return ExtractionResult(
                document_id=document_id,
                success=True,
                text_content=markdown_text,
                tables=tables,
                images=images,
                metadata={
                    'has_tables': has_tables,
                    'has_images': has_images,
                    'has_chemical_formulas': has_formulas,
                    'page_count': result.document.num_pages,
                    'word_count': len(markdown_text.split()),
                    'token_count': int(token_count),
                },
                extraction_method='docling',
                processing_time_ms=0  # Set by caller
            )

        except Exception as e:
            return ExtractionResult(
                document_id=document_id,
                success=False,
                text_content='',
                tables=[],
                images=[],
                metadata={},
                extraction_method='docling',
                error=f'Docling failed: {str(e)}'
            )


    async def _extract_with_mistral(
        self,
        file_path: str,
        document_id: str,
    ) -> ExtractionResult:
        """
        Fallback extraction using Mistral OCR API
        """
        try:
            # Convert PDF to images (if PDF)
            if file_path.endswith('.pdf'):
                images = await self._pdf_to_images(file_path)
            else:
                images = [file_path]  # Already an image

            # Process with Mistral OCR (batch)
            all_text = []
            confidence_scores = []

            for image_path in images:
                # Call Mistral OCR API
                response = await self._call_mistral_ocr(image_path)

                all_text.append(response['text'])
                confidence_scores.append(response['confidence'])

            # Combine text from all pages
            full_text = '\n\n'.join(all_text)
            avg_confidence = sum(confidence_scores) / len(confidence_scores)

            return ExtractionResult(
                document_id=document_id,
                success=True,
                text_content=full_text,
                tables=[],  # Mistral OCR doesn't extract structured tables
                images=[],
                metadata={
                    'page_count': len(images),
                    'word_count': len(full_text.split()),
                },
                extraction_method='mistral_ocr',
                ocr_confidence=avg_confidence
            )

        except Exception as e:
            return ExtractionResult(
                document_id=document_id,
                success=False,
                text_content='',
                tables=[],
                images=[],
                metadata={},
                extraction_method='mistral_ocr',
                error=f'Mistral OCR failed: {str(e)}'
            )


    def _detect_chemical_formulas(self, text: str) -> bool:
        """
        Detect presence of chemical formulas in text
        """
        import re

        # Pattern for molecular formulas (C10H20O, H2SO4, etc.)
        formula_pattern = r'\b[A-Z][a-z]?\d+(?:[A-Z][a-z]?\d+)*\b'

        matches = re.findall(formula_pattern, text)
        return len(matches) > 5  # Threshold


    async def _pdf_to_images(self, pdf_path: str) -> list[str]:
        """
        Convert PDF pages to images for OCR
        """
        from pdf2image import convert_from_path
        import tempfile

        images = convert_from_path(pdf_path, dpi=300)
        image_paths = []

        for i, image in enumerate(images):
            temp_path = f"{tempfile.gettempdir()}/page_{i}.png"
            image.save(temp_path, 'PNG')
            image_paths.append(temp_path)

        return image_paths


    async def _call_mistral_ocr(self, image_path: str) -> dict:
        """
        Call Mistral OCR API (placeholder - implement based on actual API)
        """
        # TODO: Implement actual Mistral OCR API call
        # This is a placeholder structure

        response = await self.mistral_client.ocr.process(
            image_path=image_path,
            language='auto',  # Auto-detect
        )

        return {
            'text': response.text,
            'confidence': response.confidence,
        }
```

### 6.3 Batch Processing Pipeline

```python
"""
Batch processor for extracting text from all documents
"""
import asyncio
from typing import List
from tqdm import tqdm


class BatchProcessor:
    """
    Orchestrate text extraction for thousands of documents
    """

    def __init__(
        self,
        extractor: DocumentExtractor,
        db_client,
        batch_size: int = 100,
        max_concurrency: int = 10
    ):
        self.extractor = extractor
        self.db = db_client
        self.batch_size = batch_size
        self.semaphore = asyncio.Semaphore(max_concurrency)


    async def process_all_documents(self):
        """
        Main processing loop - extract text from all pending documents
        """

        # Get all documents pending extraction
        documents = await self.db.query("""
            SELECT
                document_id,
                file_path,
                filename,
                document_type,
                supplier_name,
                ingredient_name
            FROM documents
            WHERE text_content IS NULL
              AND is_duplicate = false
            ORDER BY supplier_name, ingredient_name
        """)

        total_docs = len(documents.rows)
        print(f"Processing {total_docs} documents...")

        # Process in batches
        for i in range(0, total_docs, self.batch_size):
            batch = documents.rows[i:i + self.batch_size]

            print(f"\nProcessing batch {i//self.batch_size + 1} / {(total_docs + self.batch_size - 1)//self.batch_size}")

            # Process batch with concurrency control
            results = await self._process_batch(batch)

            # Store results
            await self._store_results(results)

            print(f"Batch complete. Success: {sum(1 for r in results if r.success)}/{len(results)}")


    async def _process_batch(self, documents: List[dict]) -> List[ExtractionResult]:
        """
        Process a batch of documents with concurrency control
        """

        async def process_one(doc):
            async with self.semaphore:
                return await self.extractor.extract_document(
                    file_path=doc['file_path'],
                    document_id=doc['document_id'],
                    document_type=doc['document_type']
                )

        # Process all documents in batch concurrently
        tasks = [process_one(doc) for doc in documents]
        return await asyncio.gather(*tasks, return_exceptions=True)


    async def _store_results(self, results: List[ExtractionResult]):
        """
        Store extraction results in database
        """
        for result in results:
            if isinstance(result, Exception):
                continue

            try:
                await self.db.query("""
                    UPDATE documents
                    SET
                        text_content = $1,
                        extraction_method = $2,
                        ocr_confidence = $3,
                        processed_date = NOW(),
                        processing_duration_ms = $4,
                        word_count = $5,
                        token_count = $6,
                        has_tables = $7,
                        has_images = $8,
                        has_chemical_formulas = $9,
                        page_count = $10
                    WHERE document_id = $11
                """, [
                    result.text_content,
                    result.extraction_method,
                    result.ocr_confidence,
                    result.processing_time_ms,
                    result.metadata.get('word_count', 0),
                    result.metadata.get('token_count', 0),
                    result.metadata.get('has_tables', False),
                    result.metadata.get('has_images', False),
                    result.metadata.get('has_chemical_formulas', False),
                    result.metadata.get('page_count', 0),
                    result.document_id,
                ])

                # Store tables separately if present
                if result.tables:
                    await self._store_tables(result.document_id, result.tables)

            except Exception as e:
                print(f"Error storing result for {result.document_id}: {e}")


    async def _store_tables(self, document_id: str, tables: List[dict]):
        """
        Store extracted tables in separate table for structured queries
        """
        for i, table in enumerate(tables):
            await self.db.query("""
                INSERT INTO document_tables (
                    document_id,
                    table_index,
                    table_data,
                    table_markdown,
                    num_rows,
                    num_cols
                ) VALUES ($1, $2, $3, $4, $5, $6)
            """, [
                document_id,
                i,
                table['data'],
                table['text'],
                table['num_rows'],
                table['num_cols'],
            ])


# Usage
async def main():
    extractor = DocumentExtractor(mistral_api_key=os.getenv('MISTRAL_API_KEY'))
    processor = BatchProcessor(extractor, db_client, batch_size=100)

    await processor.process_all_documents()

    # Print statistics
    print("\nExtraction Statistics:")
    print(f"  Docling success: {extractor.stats['docling_success']}")
    print(f"  Mistral fallback: {extractor.stats['mistral_fallback']}")
    print(f"  Failures: {extractor.stats['failures']}")


if __name__ == '__main__':
    asyncio.run(main())
```

### 6.4 Content Enhancement & Metadata Enrichment

After text extraction, enhance metadata with content-based analysis:

```python
"""
Post-extraction content analysis and metadata enrichment
"""
import re
from typing import List, Optional


class ContentAnalyzer:
    """
    Analyze extracted text to enrich metadata
    """

    def __init__(self):
        # Load reference data
        self.known_cas_numbers = self._load_cas_database()
        self.known_allergens = [
            'peanut', 'tree nut', 'almond', 'walnut', 'cashew',
            'milk', 'egg', 'fish', 'shellfish', 'soy', 'wheat',
            'sesame', 'gluten', 'lactose', 'sulfite'
        ]


    async def analyze_and_enrich(
        self,
        document_id: str,
        text: str,
        document_type: str
    ) -> dict:
        """
        Comprehensive content analysis
        """
        enriched_metadata = {}

        # Extract chemical identifiers
        enriched_metadata['cas_numbers'] = self._extract_cas_numbers(text)
        enriched_metadata['ec_numbers'] = self._extract_ec_numbers(text)
        enriched_metadata['inci_names'] = self._extract_inci_names(text)

        # Batch/lot numbers (for COA)
        if document_type == 'certificate_of_analysis':
            enriched_metadata['batch_numbers'] = self._extract_batch_numbers(text)

        # Allergen detection
        enriched_metadata['allergens'] = self._detect_allergens(text)

        # Keywords extraction
        enriched_metadata['keywords'] = self._extract_keywords(text, document_type)

        # Specifications (for Spec documents)
        if document_type in ['specification', 'technical_data_sheet']:
            enriched_metadata['specifications'] = self._extract_specifications(text)

        # Language detection
        enriched_metadata['languages_detected'] = self._detect_languages(text)

        # Store enriched metadata
        await self._update_document_metadata(document_id, enriched_metadata)

        return enriched_metadata


    def _extract_cas_numbers(self, text: str) -> List[str]:
        """
        Extract CAS registry numbers (format: 12345-67-8)
        """
        pattern = r'\b\d{2,7}-\d{2}-\d\b'
        matches = re.findall(pattern, text)

        # Validate against known CAS numbers (optional)
        validated = [cas for cas in matches if self._validate_cas(cas)]

        return list(set(validated))


    def _validate_cas(self, cas: str) -> bool:
        """
        Validate CAS number using check digit algorithm
        """
        # Remove hyphens
        digits = cas.replace('-', '')

        if len(digits) < 3:
            return False

        # Check digit is last digit
        check_digit = int(digits[-1])

        # Calculate expected check digit
        total = 0
        for i, digit in enumerate(reversed(digits[:-1])):
            total += int(digit) * (i + 1)

        expected_check = total % 10

        return expected_check == check_digit


    def _extract_ec_numbers(self, text: str) -> List[str]:
        """
        Extract EC numbers (format: 201-939-0)
        """
        pattern = r'\b\d{3}-\d{3}-\d\b'
        matches = re.findall(pattern, text)
        return list(set(matches))


    def _extract_inci_names(self, text: str) -> List[str]:
        """
        Extract INCI (International Nomenclature Cosmetic Ingredient) names
        Pattern: Usually uppercase, specific format
        """
        # Look for "INCI:" or "INCI Name:" followed by ingredient
        pattern = r'INCI(?:\s+Name)?:\s*([A-Z][A-Z\s,/()-]+?)(?:\n|\.|\||$)'
        matches = re.findall(pattern, text, re.IGNORECASE)

        # Clean up
        inci_names = []
        for match in matches:
            # Split if multiple INCI names comma-separated
            names = [n.strip() for n in match.split(',')]
            inci_names.extend(names)

        return list(set(inci_names))


    def _extract_batch_numbers(self, text: str) -> List[str]:
        """
        Extract batch/lot numbers from COA documents
        """
        patterns = [
            r'(?:Lot|Batch|Lot\s+No\.?|Batch\s+No\.?)[:\s]+([A-Z0-9]+)',
            r'\bLot[:\s]+([A-Z0-9]{6,})',
            r'\bBatch[:\s]+([A-Z0-9]{6,})',
        ]

        batches = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            batches.extend(matches)

        return list(set(batches))


    def _detect_allergens(self, text: str) -> List[str]:
        """
        Detect allergen information
        """
        text_lower = text.lower()
        found_allergens = []

        # Check for allergen-free statements
        if any(phrase in text_lower for phrase in [
            'allergen free',
            'no allergens',
            'free from allergens',
            'does not contain allergens'
        ]):
            return ['none']

        # Check for specific allergens
        for allergen in self.known_allergens:
            if allergen in text_lower:
                found_allergens.append(allergen)

        return found_allergens if found_allergens else []


    def _extract_keywords(self, text: str, document_type: str) -> List[str]:
        """
        Extract relevant keywords based on document type
        """
        # Simple TF-IDF-like extraction (can be improved with NLP)
        from collections import Counter
        import string

        # Remove punctuation and lowercase
        text_clean = text.lower().translate(str.maketrans('', '', string.punctuation))
        words = text_clean.split()

        # Filter stopwords
        stopwords = set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'])
        words = [w for w in words if w not in stopwords and len(w) > 3]

        # Get most common
        counter = Counter(words)
        keywords = [word for word, count in counter.most_common(20)]

        return keywords


    def _extract_specifications(self, text: str) -> dict:
        """
        Extract technical specifications from spec sheets
        """
        specs = {}

        # Common specification patterns
        spec_patterns = {
            'appearance': r'Appearance:\s*([^\n]+)',
            'color': r'Colo(?:u)?r:\s*([^\n]+)',
            'odor': r'Odo(?:u)?r:\s*([^\n]+)',
            'form': r'Form:\s*([^\n]+)',
            'purity': r'Purity:\s*([^\n]+)',
            'ph': r'pH:\s*([^\n]+)',
            'density': r'Density:\s*([^\n]+)',
            'melting_point': r'Melting\s+Point:\s*([^\n]+)',
            'boiling_point': r'Boiling\s+Point:\s*([^\n]+)',
            'solubility': r'Solubility:\s*([^\n]+)',
        }

        for key, pattern in spec_patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                specs[key] = match.group(1).strip()

        return specs


    def _detect_languages(self, text: str) -> List[str]:
        """
        Detect languages present in text
        """
        languages = []

        # Character-based detection (simple heuristic)
        if re.search(r'[a-zA-Z]', text):
            languages.append('en')

        if re.search(r'[\u0E00-\u0E7F]', text):  # Thai script
            languages.append('th')

        if re.search(r'[\u4E00-\u9FFF]', text):  # Chinese characters
            languages.append('zh')

        return languages if languages else ['unknown']


    async def _update_document_metadata(self, document_id: str, metadata: dict):
        """
        Update document with enriched metadata
        """
        await db.query("""
            UPDATE documents
            SET
                cas_numbers = $1,
                ec_numbers = $2,
                inci_names = $3,
                batch_numbers = $4,
                allergens = $5,
                keywords = $6,
                specifications = $7,
                languages_detected = $8
            WHERE document_id = $9
        """, [
            metadata.get('cas_numbers', []),
            metadata.get('ec_numbers', []),
            metadata.get('inci_names', []),
            metadata.get('batch_numbers', []),
            metadata.get('allergens', []),
            metadata.get('keywords', []),
            metadata.get('specifications', {}),
            metadata.get('languages_detected', []),
            document_id,
        ])
```

---

## 7. VECTOR DATABASE SETUP

### 7.1 PostgreSQL + pgvector Schema

**Recommended**: Use Neon PostgreSQL (already in your stack) with pgvector extension.

```sql
-- =============================================
-- ENABLE PGVECTOR EXTENSION
-- =============================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text search

-- =============================================
-- MAIN DOCUMENTS TABLE
-- =============================================
CREATE TABLE documents (
    -- Identity
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_hash CHAR(64) UNIQUE,
    file_size_bytes BIGINT,
    file_extension VARCHAR(10),

    -- Hierarchy (Critical for filtering)
    supplier_name TEXT NOT NULL,
    supplier_normalized TEXT NOT NULL,
    supplier_country VARCHAR(2),  -- ISO country code

    ingredient_name TEXT NOT NULL,
    ingredient_normalized TEXT NOT NULL,
    ingredient_code VARCHAR(50),
    ingredient_inci_name VARCHAR(200),
    ingredient_cas_number VARCHAR(20),

    -- Classification
    document_type VARCHAR(50) NOT NULL,
    document_category VARCHAR(30) NOT NULL,
    document_subtype VARCHAR(100),

    -- Version control
    version_date DATE,
    version_string VARCHAR(20),
    is_current BOOLEAN DEFAULT true,
    version_status VARCHAR(20) DEFAULT 'current',
    superseded_by UUID REFERENCES documents(document_id),
    supersedes UUID REFERENCES documents(document_id),

    -- Compliance
    compliance_types TEXT[],
    certification_bodies TEXT[],
    regulatory_regions TEXT[],
    expiry_date DATE,
    issue_date DATE,
    certification_number VARCHAR(100),

    -- Content
    text_content TEXT,  -- Full extracted text
    language VARCHAR(5) DEFAULT 'en',
    languages_detected TEXT[],
    has_images BOOLEAN DEFAULT false,
    has_tables BOOLEAN DEFAULT false,
    has_chemical_formulas BOOLEAN DEFAULT false,
    has_diagrams BOOLEAN DEFAULT false,
    page_count INTEGER,
    word_count INTEGER,

    -- Processing
    extraction_method VARCHAR(20),
    ocr_confidence NUMERIC(3,2),
    processed_date TIMESTAMP,
    processing_duration_ms INTEGER,
    text_length INTEGER,
    token_count INTEGER,

    -- Search optimization
    keywords TEXT[],
    cas_numbers TEXT[],
    inci_names TEXT[],
    allergens TEXT[],
    ec_numbers TEXT[],
    chemical_names TEXT[],

    -- Business context
    product_applications TEXT[],
    function_categories TEXT[],
    cosmetic_categories TEXT[],
    batch_numbers TEXT[],
    lot_numbers TEXT[],

    -- Quality
    quality_score NUMERIC(3,2),
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES documents(document_id),
    duplicate_reason VARCHAR(50),
    requires_review BOOLEAN DEFAULT false,
    review_notes TEXT,
    validation_status VARCHAR(20) DEFAULT 'pending',

    -- Custom flags
    is_discontinued BOOLEAN DEFAULT false,
    discontinuation_date DATE,
    special_notes TEXT,
    internal_notes TEXT,

    -- Technical specifications (JSONB for flexibility)
    specifications JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    indexed_at TIMESTAMP,
    last_accessed TIMESTAMP
);

-- =============================================
-- DOCUMENT EMBEDDINGS TABLE
-- =============================================
CREATE TABLE document_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,

    -- Chunking info
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    chunk_text TEXT NOT NULL,
    chunk_type VARCHAR(20) DEFAULT 'full_document',  -- full_document | section | table
    section_title VARCHAR(200),
    section_number INTEGER,

    -- Vector embedding (Titan v2: 1024 dimensions)
    embedding vector(1024) NOT NULL,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- DOCUMENT TABLES (Structured data extraction)
-- =============================================
CREATE TABLE document_tables (
    table_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    table_index INTEGER NOT NULL,
    table_data JSONB NOT NULL,
    table_markdown TEXT,
    num_rows INTEGER,
    num_cols INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- SEARCH ANALYTICS (Track user queries)
-- =============================================
CREATE TABLE search_analytics (
    search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    filters JSONB,
    results_count INTEGER,
    top_similarity_score NUMERIC(4,3),
    latency_ms INTEGER,
    user_clicked_result BOOLEAN,
    clicked_document_id UUID REFERENCES documents(document_id),
    clicked_rank INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Primary filtering indexes (heavily used)
CREATE INDEX idx_docs_supplier ON documents(supplier_normalized);
CREATE INDEX idx_docs_ingredient ON documents(ingredient_normalized);
CREATE INDEX idx_docs_type ON documents(document_type);
CREATE INDEX idx_docs_category ON documents(document_category);
CREATE INDEX idx_docs_current ON documents(is_current) WHERE is_current = true;
CREATE INDEX idx_docs_discontinued ON documents(is_discontinued) WHERE is_discontinued = false;

-- Array indexes for compliance and keywords
CREATE INDEX idx_docs_compliance ON documents USING GIN(compliance_types);
CREATE INDEX idx_docs_keywords ON documents USING GIN(keywords);
CREATE INDEX idx_docs_cas ON documents USING GIN(cas_numbers);
CREATE INDEX idx_docs_inci ON documents USING GIN(inci_names);
CREATE INDEX idx_docs_allergens ON documents USING GIN(allergens);
CREATE INDEX idx_docs_regions ON documents USING GIN(regulatory_regions);

-- Composite indexes for common query patterns
CREATE INDEX idx_docs_supplier_ingredient ON documents(supplier_normalized, ingredient_normalized);
CREATE INDEX idx_docs_type_current ON documents(document_type, is_current) WHERE is_current = true;
CREATE INDEX idx_docs_supplier_type ON documents(supplier_normalized, document_type);

-- Full-text search index
CREATE INDEX idx_docs_text_search ON documents USING GIN(to_tsvector('english', COALESCE(text_content, '')));

-- Fuzzy search (for supplier/ingredient names)
CREATE INDEX idx_docs_supplier_trgm ON documents USING GIN(supplier_normalized gin_trgm_ops);
CREATE INDEX idx_docs_ingredient_trgm ON documents USING GIN(ingredient_normalized gin_trgm_ops);

-- Date-based indexes
CREATE INDEX idx_docs_expiry ON documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_docs_version_date ON documents(version_date);

-- =============================================
-- VECTOR SIMILARITY INDEX (HNSW)
-- =============================================

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_embeddings_vector_cosine ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Can also create indexes for other distance metrics if needed:
-- CREATE INDEX idx_embeddings_vector_l2 ON document_embeddings
-- USING hnsw (embedding vector_l2_ops);

-- Foreign key index for joins
CREATE INDEX idx_embeddings_doc ON document_embeddings(document_id);
CREATE INDEX idx_tables_doc ON document_tables(document_id);

-- =============================================
-- TRIGGERS FOR AUTO-UPDATE
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

-- Function to find similar documents (vector search)
CREATE OR REPLACE FUNCTION find_similar_documents(
    query_embedding vector(1024),
    similarity_threshold FLOAT DEFAULT 0.7,
    result_limit INTEGER DEFAULT 20,
    filter_supplier TEXT DEFAULT NULL,
    filter_ingredient TEXT DEFAULT NULL,
    filter_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    document_id UUID,
    filename TEXT,
    supplier_name TEXT,
    ingredient_name TEXT,
    document_type VARCHAR(50),
    chunk_text TEXT,
    similarity_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.document_id,
        d.filename,
        d.supplier_name,
        d.ingredient_name,
        d.document_type,
        e.chunk_text,
        1 - (e.embedding <=> query_embedding) AS similarity_score
    FROM document_embeddings e
    JOIN documents d ON e.document_id = d.document_id
    WHERE
        d.is_current = true
        AND d.is_discontinued = false
        AND (1 - (e.embedding <=> query_embedding)) > similarity_threshold
        AND (filter_supplier IS NULL OR d.supplier_normalized = LOWER(filter_supplier))
        AND (filter_ingredient IS NULL OR d.ingredient_normalized = LOWER(filter_ingredient))
        AND (filter_types IS NULL OR d.document_type = ANY(filter_types))
    ORDER BY e.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### 7.2 Database Configuration for Neon

```typescript
// lib/db.ts - Neon PostgreSQL client setup
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for WebSocket (serverless environments)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = {
  async query(text: string, params?: any[]) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms):`, text);
    }

    return res;
  },

  async transaction(callback: (client: any) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await callback(client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async bulkInsert(table: string, records: any[]) {
    if (records.length === 0) return;

    // Generate bulk insert query
    const columns = Object.keys(records[0]);
    const values = records.map((record, i) => {
      const placeholders = columns.map((_, j) =>
        `$${i * columns.length + j + 1}`
      ).join(', ');
      return `(${placeholders})`;
    }).join(', ');

    const flatValues = records.flatMap(record =>
      columns.map(col => record[col])
    );

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `;

    await this.query(query, flatValues);
  },
};
```

---

**End of Part 2**

This document covered:
- Complete text extraction architecture with Docling + Mistral OCR
- Batch processing pipeline for 30K+ documents
- Content analysis and metadata enrichment
- Full PostgreSQL + pgvector database schema
- Performance-optimized indexes and utility functions

**Continue to Part 3** for:
- AWS Titan v2 embedding generation
- Chunking implementation
- Next.js API routes
- RAG chatbot integration
- Search strategies and optimization
- Cost estimation and deployment timeline
