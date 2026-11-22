import { Composition } from 'remotion';
import { HeronReel } from './Reel';
import words from './words.json';

export const FPS = 30;
export const Root = () => (
  <Composition id="HeronReel" component={HeronReel} width={1080} height={1920} fps={FPS}
    durationInFrames={Math.ceil((words.total + 1.2) * FPS)} />
);
