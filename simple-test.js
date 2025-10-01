// Simple test to verify API key
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testAPI() {
  try {
    const genAI = new GoogleGenerativeAI("AIzaSyCi-ltQczruNbbtrw-mYX1t4Jh-KI8QURg");
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const result = await model.generateContent("Hello! Say hi back.");
    const response = await result.response;
    const text = response.text();
    
    console.log("✅ API working! Response:", text);
  } catch (error) {
    console.log("❌ API error:", error.message);
  }
}

testAPI();
