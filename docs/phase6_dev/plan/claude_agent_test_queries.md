# Claude Agent SDK Test Queries

**Test Document:** Thai/English Cosmetic Ingredient Chatbot
**Database Content:** PuraBeet (Betaine) cosmetic ingredients
**Language Support:** Thai, English, Mixed Thai-English
**Test Date:** October 7, 2025

## Database Content Summary

**Document Count:** 10 documents, 15 chunks
**Primary Ingredient:** PuraBeet® (Betaine, CAS 107-43-7)
**Content Types:**
- Safety Data Sheets (REACH compliant)
- Chinese Regulatory Documentation (化妆品原料安全信息)
- Research Summaries (Hair & Skin Care)
- Certificates (COSMOS, NATRUE, HALAL, AGES)
- Technical Specifications (≥99% purity)

## Test Query Categories

### Category 1: Basic Ingredient Information (Thai Language)

#### Query T1-1: Basic Ingredient Inquiry
```
PuraBeet คืออะไร และมีส่วนผสมหลักอย่างไร?
```
**Expected Response Elements:**
- Definition of PuraBeet as betaine from sugar beet
- INCI name: Betaine
- Chemical name: Trimethylglycine
- CAS number: 107-43-7
- Purity: ≥99%

#### Query T1-2: Production Process
```
PuraBeet ผลิตจากอะไร และกระบวนการผลิตเป็นอย่างไร?
```
**Expected Response Elements:**
- Source: Native sugar beet
- Physical extraction processes only
- No chemical synthesis
- GMO-free production

#### Query T1-3: Appearance and Properties
```
PuraBeet มีลักษณะทางกายภาพอย่างไร และละลายน้ำได้หรือไม่?
```
**Expected Response Elements:**
- White, crystalline powder
- Free-flowing
- Highly soluble in water
- Faint molasses odor

### Category 2: Mixed Thai-English Technical Queries

#### Query T2-1: Hair Care Applications
```
PuraBeet เหมาะสำหรับ hair care products แบบไหน และช่วย strengthen hair ได้อย่างไร?
```
**Expected Response Elements:**
- Hair care applications (shampoos, conditioners, leave-in treatments)
- Hair strengthening properties
- Protection against brittleness
- Improvement in elasticity

#### Query T2-2: Skin Care Benefits
```
betaine ใน PuraBeet ช่วยเรื่อง skin hydration และ anti-aging ได้อย่างไร?
```
**Expected Response Elements:**
- Moisturizing properties
- Tight junction functionality
- Anti-aging effects through collagen stimulation
- Wrinkle reduction capabilities

#### Query T2-3: Formulation Guidelines
```
ถ้าจะใส่ PuraBeet ในครีม moisturizer ควรใช้ concentration เท่าไหร่?
```
**Expected Response Elements:**
- Recommended concentration: 2-5% for personal care
- Usage in leave-on vs. rinse-off products
- Combination with other ingredients

### Category 3: Regulatory and Safety (Mixed Language)

#### Query T3-1: Safety Profile
```
PuraBeet มี safety data sheet หรือไม่ และ toxic หรือเปล่า?
```
**Expected Response Elements:**
- Non-toxic classification
- REACH compliant safety data sheet
- Non-allergenic properties
- Food supplement grade

#### Query T3-2: Certificates and Standards
```
PuraBeet ได้รับการรับรอง certification อะไรบ้าง เช่น COSMOS หรือ NATRUE?
```
**Expected Response Elements:**
- COSMOS approved
- NATRUE approved
- HALAL certified
- AGES certified
- Cruelty-free

#### Query T3-3: Heavy Metals and Contamination
```
PuraBeet มีการตรวจสอบ heavy metals และ microbiological contamination หรือไม่?
```
**Expected Response Elements:**
- Heavy metals limits (Pb, Cd, As, Hg <0.1 mg/kg)
- Microbiological limits (Total count, yeast, mold <100 CFU/g)
- Quality control specifications

### Category 4: Business and Commercial Queries (English)

#### Query E4-1: Supplier Information
```
Who manufactures PuraBeet and what are their contact details?
```
**Expected Response Elements:**
- Manufacturer: Beta Pura GmbH
- Address: Josef-Reither-Strasse 21-23, A-3430 Tulln, Austria
- Contact information
- AGRANA trademark

#### Query E4-2: Applications and Market
```
What are the main applications for PuraBeet in cosmetics and personal care?
```
**Expected Response Elements:**
- Face care, body care, hand creams
- Hair care products (shampoos, conditioners)
- Anti-aging formulations
- Cleansing products
- Sun care products

#### Query E4-3: Competitive Advantages
```
What makes PuraBeet different from other betaine sources in the market?
```
**Expected Response Elements:**
- Sugar beet source (vs synthetic)
- High purity (≥99%)
- Multiple certifications
- Upcycled certified ingredients
- Physical extraction process

### Category 5: Technical Formulation (Advanced)

#### Query T5-1: Compatibility and Stability
```
PuraBeet สามารถใช้ร่วมกับ AHA/BHA acids ได้หรือไม่ และจะ pH buffering หรือเปล่า?
```
**Expected Response Elements:**
- pH buffering properties
- Compatibility with glycolic acid
- pH range 5-7 in solution
- Stability considerations

#### Query T5-2: Sensory Properties
```
PuraBeet ช่วยปรับปรุง texture และ sensory feel ของครีมอย่างไร?
```
**Expected Response Elements:**
- Silk-smooth feel
- Reduces stickiness of glycerin
- Improves spreadability
- Velvety to soft feel enhancement

#### Query T5-3: Anti-Inflammatory Properties
```
มีงานวิจัยใดที่แสดงว่า PuraBeet มี anti-inflammatory effects บนผิวหนัง?
```
**Expected Response Elements:**
- Reduction in mechanical-induced erythema
- 60-minute post-application studies
- 4% betaine solution efficacy
- Skin redness reduction

### Category 6: Specific Use Cases (Complex Scenarios)

#### Query T6-1: Hair Damage Repair
```
สำหรับผมที่ bleach แล้วเสียหาย PuraBeet จะช่วยซ่อมแซมและเพิ่มความแข็งแรงได้อย่างไร?
```
**Expected Response Elements:**
- Studies on bleached European and Asian hair
- Improvement in elastic extension
- Reduction in brittleness
- Hair strength parameter improvements

#### Query T6-2: Skin Lightening Applications
```
PuraBeet มีคุณสมบัติ skin lightening หรือไม่ และกลไกการทำงานเป็นอย่างไร?
```
**Expected Response Elements:**
- Melanin content reduction
- Tyrosinase enzyme inhibition
- MITF downregulation
- B16-F1 melanocyte studies

#### Query T6-3: UV Protection Enhancement
```
การใช้ PuraBeet ในผลิตภัณฑ์กันแดดจะช่วยเพิ่มประสิทธิภาพการป้องกัน UV damage ได้หรือไม่?
```
**Expected Response Elements:**
- Tight junction protection under UVB
- Osmolyte protection functions
- Protein stabilization under UV stress
- Keratinocyte protection studies

## Test Execution Strategy

### Phase 1: Basic Functionality Testing
1. Test language detection accuracy
2. Verify INCI name and CAS number retrieval
3. Validate basic ingredient information responses

### Phase 2: Mixed Language Processing
1. Test Thai-English mixed queries
2. Verify technical term preservation
3. Validate response language selection

### Phase 3: Complex Query Resolution
1. Test multi-document information synthesis
2. Verify scientific data accuracy
3. Validate business context understanding

### Phase 4: Vector Search Validation
1. Execute direct vector similarity searches
2. Compare RAG results with manual searches
3. Verify ranking and relevance scores

## Expected Success Criteria

### Language Processing
- ✅ Accurate Thai language detection (>95%)
- ✅ Proper mixed Thai-English handling
- ✅ Appropriate response language selection

### Content Accuracy
- ✅ Correct INCI names and CAS numbers
- ✅ Accurate technical specifications
- ✅ Proper regulatory information

### Business Context
- ✅ Relevant application suggestions
- ✅ Appropriate formulation guidance
- ✅ Correct supplier information

### RAG Performance
- ✅ Relevant document chunk retrieval
- ✅ Accurate similarity scoring
- ✅ Comprehensive answer synthesis

## Test Environment

**Development Server:** http://localhost:3000
**Chatbot Playground:** `/chatbots/{id}/playground`
**Database:** Neon PostgreSQL (orange-credit-10889790)
**Model:** AWS Bedrock Claude 3.5 Sonnet
**Vector Search:** pgvector with HNSW and IVFFlat indexes

## Validation Methods

1. **Manual Review:** Compare responses with source documents
2. **Vector Search Verification:** Execute direct SQL queries for comparison
3. **Language Analysis:** Verify Thai character handling and English term preservation
4. **Business Logic Testing:** Confirm appropriate context detection and response selection

---

**Document prepared for:** Claude Agent SDK Phase 6 Testing
**Test execution date:** October 7, 2025
**Review required by:** Development Team