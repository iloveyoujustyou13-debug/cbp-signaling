# ১. অফিশিয়াল Node.js ইমেজ ব্যবহার করা হচ্ছে
FROM node:18-slim

# ২. সার্ভারের ভেতর অত্যন্ত পাওয়ারফুল Linux FFmpeg ইনস্টল করার কমান্ড
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# ৩. কন্টেইনারের ভেতর ওয়ার্কিং ডিরেক্টরি সেট করা
WORKDIR /usr/src/app

# ৪. ডিপেন্ডেন্সি ফাইল কপি এবং ইনস্টল করা
COPY package*.json ./
RUN npm install

# ৫. বাকি সব ব্যাকএন্ড কোড (server.js) কন্টেইনারে কপি করা
COPY . .

# ৬. রেন্ডার সার্ভারের পোর্ট ওপেন করা
EXPOSE 5000

# 🚀 ৭. সার্ভার চালু করার ফাইনাল কমান্ড
CMD [ "npm", "start" ]
