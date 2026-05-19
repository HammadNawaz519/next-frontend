<div align="center">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io" />
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
  
  <h1 align="center">ASL Lens</h1>
  <p align="center">
    <strong>A next-generation platform for Real-Time ASL Translation, Seamless Communication, and AI-Powered Accessibility.</strong>
  </p>
  
  <h3>🌍 Live Demo: <a href="https://the-dev-core.vercel.app/">https://the-dev-core.vercel.app/</a></h3>
</div>

<hr />

## ✨ Features

- **Real-Time ASL Translation** 🖐️: Instantly translates American Sign Language via webcam into text using a custom Machine Learning pipeline.
- **AI-Powered "Deaf Advisor" Interpretation** 🧠: Disjointed ASL signs are compiled and intelligently reconstructed into grammatically correct sentences in real-time by a Groq-powered LLM.
- **WebRTC Video Calls with Live Subtitles** 📹: Connect with peers via seamless video and audio calls. Your ASL translations are broadcast directly to the recipient as live captions.
- **Voice-to-Text Transcription** 🎙️: Fully integrated real-time speech recognition for hearing users, broadcasting spoken words as subtitles to the deaf user.
- **AI Studio Mode** 🎥: Hardware-accelerated background removal and dynamic ROI tracking using MediaPipe Selfie Segmentation to isolate hand gestures for optimal accuracy.
- **Social Chat & History** 💬: Full chat functionality, message history, and user search to easily connect with the community.

## 🧠 How It Works: The ML & AI Pipeline

ASL Lens operates using a sophisticated multi-layered architecture designed for ultra-low latency:

### 1. Optical Capture & Preprocessing (Frontend)
The user's webcam feed is processed directly in the browser. Using **TensorFlow.js** and **MediaPipe Selfie Segmentation**, the subject is cleanly segmented from their background (AI Studio Mode). The feed is dynamically cropped to the region of interest (the hands and torso) to maximize signal-to-noise ratio before being transmitted as compressed frames.

### 2. ASL Classification (Backend)
The optimized frames are transmitted to our Python Flask backend. The backend utilizes a computer vision classification model tailored for spatial hand-tracking. The model rapidly extracts hand landmarks and outputs the highest-probability sign (e.g., specific letters or words) back to the frontend at ~10-15 FPS.

### 3. Contextual LLM Reconstruction (Groq AI)
ASL syntax often differs from spoken English, resulting in disjointed strings of words (e.g., "STORE GO I").
Once a user pauses signing for 2 seconds, our system automatically groups the recently accumulated words and passes them to a blazing-fast **Groq LLaMA-3 model**. Given a custom "Deaf Advisor" system prompt, the AI intelligently interprets the intent and forms a proper, empathetic sentence (e.g., *"The user is saying: I am going to the store."*).

### 4. WebRTC Subtitle Broadcasting
In video calls, this AI-reconstructed sentence is immediately emitted via a low-latency **Socket.io signaling server** directly into the active WebRTC peer connection. This allows the receiver to read beautifully formatted, conversational subtitles in real time.

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- A valid Groq API Key

### Frontend Setup

1. Clone the repository and navigate to the `Frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
3. Create a `.env.local` file and add your environment variables:
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
   NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key_here
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```

### Backend Setup
1. Navigate to the `Backend` directory.
2. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask classification server:
   ```bash
   python server.py
   # or
   python app.py
   ```

## 🛠 Tech Stack
* **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, WebRTC, Socket.io-client, TensorFlow.js.
* **Backend**: Python, Flask, MediaPipe, OpenCV.
* **AI/LLM**: Groq (LLaMA-3 8B) for natural language processing, Whisper (Voice-to-Text).
* **Signaling**: Custom Node.js Socket.io server.

---
*Built with ❤️ for accessible communication.*
