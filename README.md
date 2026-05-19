<div align="center">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io" />
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
  <img src="https://img.shields.io/badge/Groq-FF3333?style=for-the-badge&logo=groq&logoColor=white" alt="Groq AI" />
  
  <br />
  <br />

  <h1 align="center">ASL Lens</h1>
  <p align="center">
    <strong>A next-generation platform for Real-Time ASL Translation, Seamless Communication, and AI-Powered Accessibility.</strong>
  </p>
  
  <h3>🌍 Live Demo: <a href="https://the-dev-core.vercel.app/">https://the-dev-core.vercel.app/</a></h3>
</div>

<hr />

## 📖 Our Mission

Communication is a fundamental human right. However, millions of deaf and hard-of-hearing individuals worldwide face daily barriers when interacting in a society predominantly reliant on spoken language. **ASL Lens** was created to bridge this gap. By leveraging cutting-edge computer vision, real-time WebRTC architecture, and advanced Large Language Models, ASL Lens empowers users to communicate natively through American Sign Language while seamlessly translating and converting it into natural spoken text for others. 

We envision a world where sign language interpretation is universally accessible, breaking down invisible walls and fostering true digital inclusivity.

---

## ✨ Comprehensive Feature Set

### 🖐️ Real-Time Optical ASL Translation
- **Zero-Latency Recognition:** Instantly tracks and translates ASL alphabets and words via the user's webcam.
- **Hardware-Accelerated AI Studio:** Employs TensorFlow.js and MediaPipe Selfie Segmentation directly in the browser to isolate the user's hands and torso. By artificially generating a dark contrast background, the system drastically reduces visual noise and boosts backend prediction accuracy, even in low-light environments.
- **Dynamic Region of Interest (ROI):** Automatically crops the video feed around the user's hands, transmitting only highly relevant pixels to the machine learning backend to save bandwidth and improve inference speeds.

### 🧠 The "Deaf Advisor" AI Interpretation
- **Natural Language Reconstruction:** ASL syntax is highly efficient and often differs grammatically from spoken English, which can result in disjointed outputs like *"STORE GO I"*. 
- **Groq LLaMA-3 Integration:** When a user pauses their signing, ASL Lens automatically routes the raw signed words to an ultra-fast Groq LLM. Acting as a "Deaf Advisor," the AI infers context and translates the raw words into a beautifully formatted, empathetic, and grammatically correct English sentence (*e.g., "The user is saying: I am going to the store."*).

### 📹 Peer-to-Peer WebRTC Video Calling
- **Integrated Video Chat:** Fully featured video and audio calling utilizing modern WebRTC protocols.
- **Live Sign Subtitles:** As the AI reconstructs the deaf user's signs into full sentences, those sentences are broadcast over a low-latency WebRTC data channel and displayed instantly as live subtitles on the receiving user's screen.
- **Voice-to-Text Transcription:** For hearing participants, integrated Speech-to-Text APIs listen to spoken words and simultaneously broadcast them as live text captions to the deaf participant, enabling a flawless two-way conversation.

### 💬 Social & Community Ecosystem
- **Real-Time Text Chat:** Find users via our search system and instantly start chatting over Socket.io.
- **Message & Call History:** Chat history and missed calls are securely stored in a PostgreSQL database via Prisma ORM, allowing you to pick up conversations right where you left off.
- **End-to-End Status:** See when users are online, typing, or actively in a call.

---

## 🏗️ Technical Architecture & The ML Pipeline

ASL Lens is built on a highly modular architecture that divides heavy lifting across the client, an inference backend, and cloud LLMs.

### 1. Client-Side Preprocessing (Next.js & TensorFlow.js)
Instead of sending raw 1080p video frames to a server (which introduces massive latency), the Next.js frontend handles preprocessing:
- Using `@tensorflow-models/body-segmentation`, it creates a binary mask of the user.
- It overlays this mask onto an offscreen canvas, replacing complex real-world backgrounds with an optimized `#09090b` matte.
- The isolated subject is compressed into a JPEG blob and sent to the Flask backend at an optimized ~15 frames per second.

### 2. Backend Inference Engine (Flask & PyTorch)
The Python Flask backend is the workhorse for classification:
- It receives the compressed frame and extracts hand landmarks using **MediaPipe Hands**.
- The extracted coordinates (21 3D landmarks) are normalized and fed into our custom PyTorch neural network. 
- **Model Training Process (`.pth`):** The model was trained from scratch using a meticulously curated dataset of ASL hand gestures. We trained a lightweight deep neural network (DNN) over **20 epochs** to achieve a delicate balance between high accuracy and ultra-low latency inference. The resulting weights were exported as a highly optimized `.pth` state dictionary, which is loaded into memory on server boot.
- By relying on this single-frame spatial classification model, we bypass the latency spikes of Test-Time Augmentation (TTA), allowing the system to determine the precise sign in under 50ms and return the predicted label to the client.

### 3. Contextual LLM Layer (Groq)
The client accumulates the predicted labels into a raw sentence buffer.
- Utilizing a 2-second debounce mechanism, the client detects when the user has finished a thought.
- A REST call is made to Groq's LLaMA-3 8B model via their OpenAI-compatible API.
- The prompt is strictly engineered: *"Interpret these disjointed words into a proper, coherent sentence. Output ONLY the final interpreted sentence starting with 'The user is saying: '."*

### 4. Signaling & WebRTC Subtitles
- A Node.js / Socket.io server handles the signaling required to punch through NATs (using Google and Twilio STUN/TURN servers) and establish the WebRTC peer connection.
- Once connected, media streams (Audio/Video) flow directly peer-to-peer.
- The AI-generated captions and Voice-to-Text transcripts are passed back and forth via `socket.emit('webrtc_signal', { signal: { caption: text } })`, ensuring that the subtitles arrive perfectly synchronized with the video frames.

---

## 🚀 Getting Started (Local Development)

To run this project locally, you will need to start both the Next.js frontend and the Python Flask backend.

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- PostgreSQL Database
- A valid Groq API Key

### 1. Frontend Setup

Navigate to the `Frontend` directory and install dependencies:
```bash
cd Frontend
npm install
# or
pnpm install
```

Create a `.env.local` file in the root of the `Frontend` directory:
```env
# Your Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080

# For AI Context Interpretation & Whisper Voice-to-Text
NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key_here

# Prisma Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/asllens
```

Initialize your database:
```bash
npx prisma generate
npx prisma db push
```

Start the Next.js development server:
```bash
npm run dev
```

### 2. Backend Setup

Navigate to the `Backend` directory:
```bash
cd ../Backend
```

Create a virtual environment (recommended) and install the Python dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Run the Flask classification server:
```bash
python server.py
# or
python app.py
```
*Note: Ensure the backend is running on port 8080 so the frontend can properly communicate with it.*

---

## 🔮 Future Roadmap
- **Dynamic Two-Handed Tracking:** Upgrading the classification model to fully support complex two-handed ASL gestures (e.g., words like "Family" or "House").
- **Custom Dictionary Training:** Allowing users to register custom names and colloquialisms to their local model.
- **Mobile Native Applications:** Porting the WebRTC architecture into React Native for optimized mobile hardware usage.

---
*Built with ❤️ and dedicated to a more accessible future.*
