import { sanJeronimoStory } from "./sanJeronimo.js";

const stories = new Map([[sanJeronimoStory.id, sanJeronimoStory]]);

export function getStory(storyId = sanJeronimoStory.id) {
  return stories.get(storyId) || null;
}

export function toPublicStory(story) {
  if (!story) return null;
  return {
    id: story.id,
    title: story.title,
    location: story.location,
    atmosphere: story.atmosphere,
    introduction: [...story.introduction],
    transitionText: story.transitionText
  };
}
