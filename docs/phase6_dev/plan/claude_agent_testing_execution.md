# Claude Agent SDK Testing Execution Protocol

**Document**: Phase 6.2 Step 1 Testing Protocol
**Purpose**: Comprehensive validation of Claude Agent SDK with Thai/English cosmetic chatbot
**Target System**: http://localhost:3000/chatbots/{id}/playground
**Test Database**: Neon PostgreSQL (orange-credit-10889790) with PuraBeet cosmetic ingredient data
**Test Date**: October 7, 2025

## Pre-Testing Validation ✅

### System Status Verification
Before beginning testing, verify all foundation systems are operational:

1. **Development Server Status**:
   ```bash
   # Verify Next.js server is running
   curl http://localhost:3000/api/health

   # Verify WebSocket server is operational
   # Should show: ✓ WebSocket server running on ws://localhost:3001/api/ws
   ```

2. **Database Connectivity**:
   ```sql
   -- Verify vector database content
   SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL;
   -- Expected: 15 chunks with embeddings

   -- Verify vector search functionality
   SELECT chunk_index, content, metadata
   FROM document_chunks
   WHERE document_id = '550e8400-e29b-41d4-a716-446655440001'
   ORDER BY chunk_index;
   ```

3. **AWS Bedrock Access**:
   ```bash
   # Verify AWS credentials
   aws bedrock list-foundation-models --region us-east-1 --query 'modelSummaries[?contains(modelId, `claude`)].modelId'
   ```

### Environment Configuration
- **Development Server**: http://localhost:3000 ✅
- **WebSocket Server**: ws://localhost:3001/api/ws ✅
- **Database**: Neon PostgreSQL with pgvector ✅
- **AI Model**: AWS Bedrock Claude 3.5 Sonnet ✅
- **Vector Embeddings**: 1024 dimensions, 15 chunks ✅

## Testing Protocol

### Phase 1: Basic Functionality Testing (30 minutes)

#### Test Setup
1. **Access Chatbot Playground**:
   - Navigate to: http://localhost:3000/dashboard/chatbots
   - Select an existing chatbot or create a new one
   - Access the playground interface
   - Verify WebSocket connection is established

2. **Baseline Performance Test**:
   ```
   Test Query: "Hello, can you help me with cosmetic ingredients?"
   Expected:
   - Response in English
   - Connection established
   - Response time < 2 seconds
   ```

#### Test Execution: Category 1 - Basic Thai Ingredient Information

**Test T1-1: Basic Ingredient Inquiry**
```
Query: PuraBeet คืออะไร และมีส่วนผสมหลักอย่างไร?
Translation: What is PuraBeet and what are its main components?

Expected Response Elements:
✓ Definition of PuraBeet as betaine from sugar beet
✓ INCI name: Betaine
✓ Chemical name: Trimethylglycine
✓ CAS number: 107-43-7
✓ Purity: ≥99%

Validation Criteria:
- Language detection: Thai detected correctly
- Response language: Thai (primary) with English technical terms
- Technical accuracy: CAS number and INCI name correct
- Response time: < 2 seconds
```

**Test T1-2: Production Process**
```
Query: PuraBeet ผลิตจากอะไร และกระบวนการผลิตเป็นอย่างไร?
Translation: What is PuraBeet made from and what is the production process?

Expected Response Elements:
✓ Source: Native sugar beet
✓ Physical extraction processes only
✓ No chemical synthesis
✓ GMO-free production

Validation Criteria:
- Manufacturing details correctly retrieved from knowledge base
- No hallucinated information about production processes
- Appropriate business context understanding
```

**Test T1-3: Physical Properties**
```
Query: PuraBeet มีลักษณะทางกายภาพอย่างไร และละลายน้ำได้หรือไม่?
Translation: What are the physical characteristics of PuraBeet and is it water-soluble?

Expected Response Elements:
✓ White, crystalline powder
✓ Free-flowing
✓ Highly soluble in water
✓ Faint molasses odor

Validation Criteria:
- Physical properties accurately described
- Solubility information correct
- Technical details preserved from source documents
```

### Phase 2: Mixed Language Processing (30 minutes)

#### Test Execution: Category 2 - Thai-English Technical Queries

**Test T2-1: Hair Care Applications**
```
Query: PuraBeet เหมาะสำหรับ hair care products แบบไหน และช่วย strengthen hair ได้อย่างไร?
Translation: What hair care products is PuraBeet suitable for and how does it help strengthen hair?

Expected Response Elements:
✓ Hair care applications (shampoos, conditioners, leave-in treatments)
✓ Hair strengthening properties
✓ Protection against brittleness
✓ Improvement in elasticity

Validation Criteria:
- Mixed Thai-English query processed correctly
- English technical terms preserved in response
- Hair care research data accurately retrieved
- Business applications appropriately suggested
```

**Test T2-2: Skin Care Benefits**
```
Query: betaine ใน PuraBeet ช่วยเรื่อง skin hydration และ anti-aging ได้อย่างไร?
Translation: How does betaine in PuraBeet help with skin hydration and anti-aging?

Expected Response Elements:
✓ Moisturizing properties
✓ Tight junction functionality
✓ Anti-aging effects through collagen stimulation
✓ Wrinkle reduction capabilities

Validation Criteria:
- Scientific terminology correctly preserved
- Mechanism of action accurately described
- Research findings appropriately cited
- Response maintains technical accuracy
```

**Test T2-3: Formulation Guidelines**
```
Query: ถ้าจะใส่ PuraBeet ในครีม moisturizer ควรใช้ concentration เท่าไหร่?
Translation: If adding PuraBeet to a moisturizer cream, what concentration should be used?

Expected Response Elements:
✓ Recommended concentration: 2-5% for personal care
✓ Usage in leave-on vs. rinse-off products
✓ Combination with other ingredients

Validation Criteria:
- Formulation guidance technically accurate
- Concentration ranges appropriate for cosmetic use
- Application-specific recommendations provided
- Safety considerations mentioned
```

### Phase 3: Regulatory and Safety Validation (20 minutes)

#### Test Execution: Category 3 - Regulatory Information

**Test T3-1: Safety Profile**
```
Query: PuraBeet มี safety data sheet หรือไม่ และ toxic หรือเปล่า?
Translation: Does PuraBeet have a safety data sheet and is it toxic?

Expected Response Elements:
✓ Non-toxic classification
✓ REACH compliant safety data sheet
✓ Non-allergenic properties
✓ Food supplement grade

Validation Criteria:
- Safety information accurately retrieved
- Regulatory compliance correctly stated
- Toxicity assessment appropriately communicated
- Documentation availability confirmed
```

**Test T3-2: Certifications**
```
Query: PuraBeet ได้รับการรับรอง certification อะไรบ้าง เช่น COSMOS หรือ NATRUE?
Translation: What certifications does PuraBeet have, such as COSMOS or NATRUE?

Expected Response Elements:
✓ COSMOS approved
✓ NATRUE approved
✓ HALAL certified
✓ AGES certified
✓ Cruelty-free

Validation Criteria:
- All certifications accurately listed
- Certification bodies correctly identified
- Certificate validity properly communicated
- Industry standards appropriately referenced
```

### Phase 4: Business Context Testing (20 minutes)

#### Test Execution: Category 4 - English Business Queries

**Test E4-1: Supplier Information**
```
Query: Who manufactures PuraBeet and what are their contact details?

Expected Response Elements:
✓ Manufacturer: Beta Pura GmbH
✓ Address: Josef-Reither-Strasse 21-23, A-3430 Tulln, Austria
✓ Contact information
✓ AGRANA trademark

Validation Criteria:
- Supplier information accurately provided
- Contact details correct and current
- Business relationship properly explained
- Brand ownership correctly attributed
```

**Test E4-2: Market Applications**
```
Query: What are the main applications for PuraBeet in cosmetics and personal care?

Expected Response Elements:
✓ Face care, body care, hand creams
✓ Hair care products (shampoos, conditioners)
✓ Anti-aging formulations
✓ Cleansing products
✓ Sun care products

Validation Criteria:
- Market applications comprehensive and accurate
- Application categories appropriately detailed
- Business opportunities properly highlighted
- Market positioning correctly communicated
```

### Phase 5: Advanced Technical Validation (30 minutes)

#### Test Execution: Category 5 - Technical Formulation

**Test T5-1: Compatibility and Stability**
```
Query: PuraBeet สามารถใช้ร่วมกับ AHA/BHA acids ได้หรือไม่ และจะ pH buffering หรือเปล่า?
Translation: Can PuraBeet be used with AHA/BHA acids and does it provide pH buffering?

Expected Response Elements:
✓ pH buffering properties
✓ Compatibility with glycolic acid
✓ pH range 5-7 in solution
✓ Stability considerations

Validation Criteria:
- Technical compatibility accurately assessed
- pH buffering properties correctly described
- Chemical interactions properly evaluated
- Formulation guidance technically sound
```

**Test T5-2: Sensory Properties**
```
Query: PuraBeet ช่วยปรับปรุง texture และ sensory feel ของครีมอย่างไร?
Translation: How does PuraBeet improve the texture and sensory feel of creams?

Expected Response Elements:
✓ Silk-smooth feel
✓ Reduces stickiness of glycerin
✓ Improves spreadability
✓ Velvety to soft feel enhancement

Validation Criteria:
- Sensory properties accurately described
- Texture improvements properly explained
- Consumer benefits clearly communicated
- Technical mechanisms appropriately detailed
```

### Phase 6: Complex Scenario Testing (30 minutes)

#### Test Execution: Category 6 - Specific Use Cases

**Test T6-1: Hair Damage Repair**
```
Query: สำหรับผมที่ bleach แล้วเสียหาย PuraBeet จะช่วยซ่อมแซมและเพิ่มความแข็งแรงได้อย่างไร?
Translation: For hair damaged by bleaching, how can PuraBeet help repair and strengthen it?

Expected Response Elements:
✓ Studies on bleached European and Asian hair
✓ Improvement in elastic extension
✓ Reduction in brittleness
✓ Hair strength parameter improvements

Validation Criteria:
- Research studies appropriately referenced
- Hair damage mechanisms correctly explained
- Repair benefits scientifically supported
- Application recommendations technically sound
```

**Test T6-2: Anti-Inflammatory Research**
```
Query: มีงานวิจัยใดที่แสดงว่า PuraBeet มี anti-inflammatory effects บนผิวหนัง?
Translation: What research shows that PuraBeet has anti-inflammatory effects on skin?

Expected Response Elements:
✓ Reduction in mechanical-induced erythema
✓ 60-minute post-application studies
✓ 4% betaine solution efficacy
✓ Skin redness reduction

Validation Criteria:
- Research findings accurately cited
- Study parameters correctly described
- Clinical evidence appropriately presented
- Scientific methodology properly explained
```

## Performance Benchmarking

### Response Time Measurement Protocol

1. **Query Submission**:
   - Record timestamp when query is submitted
   - Monitor WebSocket message transmission
   - Track Claude Agent SDK processing time
   - Measure vector search execution time

2. **Response Analysis**:
   - Total response time (submission to complete response)
   - Vector search time (database query execution)
   - Claude processing time (AI response generation)
   - Network transmission time (WebSocket latency)

3. **Performance Targets**:
   - **Total Response Time**: < 2 seconds for simple queries, < 5 seconds for complex
   - **Vector Search**: < 100ms (current: 0.266ms ✅)
   - **Claude Processing**: < 1.5 seconds
   - **Network Latency**: < 50ms (local development)

### Language Detection Validation

1. **Thai Language Detection**:
   ```
   Test Queries:
   - "PuraBeet คืออะไร" (Pure Thai)
   - "PuraBeet เหมาะสำหรับ hair care" (Mixed Thai-English)
   - "betaine ใน PuraBeet ช่วยเรื่อง skin hydration" (Technical mixed)

   Success Criteria:
   - Primary language correctly identified as Thai (>95% confidence)
   - English technical terms preserved in processing
   - Response language appropriate to query language
   ```

2. **English Language Detection**:
   ```
   Test Queries:
   - "What is PuraBeet?" (Pure English)
   - "How does betaine work in cosmetics?" (Technical English)

   Success Criteria:
   - Language correctly identified as English (>95% confidence)
   - Response provided in English
   - Technical accuracy maintained
   ```

### Vector Search Accuracy Validation

1. **Manual Verification Protocol**:
   ```sql
   -- For each test query, verify vector search results
   SELECT
       dc.chunk_index,
       dc.content,
       dc.metadata,
       dc.embedding <-> query_embedding AS similarity_score
   FROM document_chunks dc
   WHERE dc.embedding IS NOT NULL
   ORDER BY dc.embedding <-> query_embedding
   LIMIT 5;
   ```

2. **Relevance Scoring**:
   - **Highly Relevant** (Score 0.0-0.3): Direct answer to query
   - **Moderately Relevant** (Score 0.3-0.6): Related information
   - **Low Relevance** (Score 0.6-1.0): Tangentially related

3. **Accuracy Validation**:
   - Compare AI response facts with source document content
   - Verify INCI names, CAS numbers, and technical specifications
   - Confirm regulatory information accuracy
   - Validate supplier and contact information

## Test Result Documentation Protocol

### Real-Time Testing Log
For each test query, document:

1. **Query Information**:
   - Test ID (T1-1, T2-1, etc.)
   - Query text (original language)
   - Query translation (if applicable)
   - Timestamp of submission

2. **Response Analysis**:
   - Full response text
   - Response language
   - Response time (total and breakdown)
   - Language detection accuracy
   - Technical accuracy assessment

3. **Vector Search Results**:
   - Top 5 similarity search results
   - Relevance scores
   - Document chunks retrieved
   - Search accuracy rating

4. **Performance Metrics**:
   - Response time measurements
   - Token usage (if available)
   - Memory usage
   - Network latency

5. **Validation Status**:
   - ✅ Pass / ❌ Fail for each expected response element
   - Overall test result
   - Issues identified
   - Recommendations for improvement

### Screenshot Documentation
Capture screenshots for:
- Query submission in playground interface
- Complete response display
- WebSocket connection status
- Performance metrics (if displayed in browser dev tools)

### Issue Tracking
Document any issues encountered:
- **Critical**: Response inaccuracy, system errors, connection failures
- **Major**: Performance degradation, language detection errors
- **Minor**: UI/UX issues, minor response improvements

## Post-Testing Analysis

### Success Criteria Evaluation
- **Language Processing**: >95% accuracy achieved ✅/❌
- **Technical Accuracy**: All INCI names and CAS numbers correct ✅/❌
- **Response Times**: <2 seconds for simple queries ✅/❌
- **Vector Search**: Relevant results in top 3 positions ✅/❌
- **Business Context**: Appropriate recommendations provided ✅/❌

### Performance Summary
- **Total Tests Executed**: [count]
- **Successful Tests**: [count] ([percentage]%)
- **Failed Tests**: [count] ([percentage]%)
- **Average Response Time**: [seconds]
- **Language Detection Accuracy**: [percentage]%

### Recommendations
Based on testing results, provide:
1. **Immediate Fixes Required**: Critical issues that must be addressed
2. **Performance Optimizations**: Areas for improvement
3. **Production Readiness Assessment**: Go/No-go recommendation
4. **Next Steps**: Preparation for Step 2 (AWS WebSocket implementation)

---

**Document Status**: Ready for Execution
**Testing Window**: October 7-8, 2025
**Execution Team**: Development Team
**Results Documentation**: `phase6_2_testing_results.md`