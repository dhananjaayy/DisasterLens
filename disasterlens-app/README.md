# DisasterLens Field

A standalone Expo / React Native app for assessing satellite imagery with the DisasterLens API. This project lives beside the repository's existing `disasterlens-mobile` app so it can be reviewed and merged separately.

## Run locally

1. Install dependencies in this folder with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Start Expo with `npx expo start`, then open the project in Expo Go.

## Assessment flow

- Flood assessment uses one post-disaster image.
- Wildfire and earthquake assessments use a post-disaster image and a pre-disaster baseline.
- The app sends `file`, optional `file_pre`, and `disaster_type` to `POST /analyze/`.
- The result screen uses the API response and displays an error if the API is unavailable. It does not invent fallback scores.

Impact and damage are image-based estimates. The API does not provide a mapped overlay, confidence, or geographic area.
