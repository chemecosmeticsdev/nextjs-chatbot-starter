The next implementation is Admin only settings, make sure to have a working database connection interating with
   CRUD interface. The setting that we need 1. Mistral OCR api key (for text extraction using OCR) 2. AWS Bedrock
   credentails (key, secret and region) 3. Default LLM for classification task (dropdown list from available 
  Bedrock models) 4. s3 bucket address to store uploaded document 5. Embedding model (disabled for change but 
  visible). Please refer to .env.local for related credentails try to prepopulate as many as possible. You can 
  suggest alternatives/modifications if neccessary.

  For API endpoints, please try to follow design doucments at @docs/design_docs/ . Refer to the up-to-date one 
  that coincide with the real Neon database schema (refer to .env.local for correct Neon project connection).