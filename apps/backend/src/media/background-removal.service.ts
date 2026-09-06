import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Worker } from 'worker_threads';
import sharp = require('sharp');

export type BackgroundRemovalMode = 'none' | 'threshold' | 'ai';

export type BackgroundRemovalOptions = {
  mode?: BackgroundRemovalMode;
  threshold?: number;
  feather?: number;
  cleanupSpeckles?: boolean;
  speckleSize?: number;
};

@Injectable()
export class BackgroundRemovalService {
  private readonly logger = new Logger(BackgroundRemovalService.name);

  constructor(@Optional() private readonly config?: ConfigService) {}

  async remove(input: Buffer, options: BackgroundRemovalOptions = {}) {
    const mode = options.mode ?? 'ai';
    if (mode === 'none') return input;

    if (mode === 'ai') {
      const aiOutput = await this.tryCommandProvider(input);
      if (aiOutput) return aiOutput;
    }

    return this.removeLightBackground(input, options);
  }

  private async tryCommandProvider(input: Buffer) {
    const command = this.config?.get<string>('BACKGROUND_REMOVAL_COMMAND', '').trim();
    if (!command) return null;

    const workDir = join(tmpdir(), `sticker-foundry-bg-${randomUUID()}`);
    const inputPath = join(workDir, 'input.png');
    const outputPath = join(workDir, 'output.png');

    try {
      await mkdir(workDir, { recursive: true });
      await writeFile(inputPath, input);
      const parts = this.commandParts(command, inputPath, outputPath);
      if (parts.length === 0) return null;
      await this.runCommand(parts[0], parts.slice(1), workDir);
      return await readFile(outputPath);
    } catch (error) {
      this.logger.warn(`AI background removal failed; falling back to threshold: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async removeLightBackground(input: Buffer, options: BackgroundRemovalOptions) {
    const image = sharp(input).ensureAlpha().rotate();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const threshold = clamp(Math.round(options.threshold ?? 238), 180, 255);
    const feather = clamp(Math.round(options.feather ?? 14), 0, 48);
    const colorTolerance = 28;

    const processed = await runBackgroundPixelWorker(data, {
      width: info.width,
      height: info.height,
      channels: info.channels,
      threshold,
      feather,
      colorTolerance,
      cleanupSpeckles: options.cleanupSpeckles !== false,
      speckleSize: options.speckleSize ?? 24,
    });

    return sharp(processed, { raw: info }).png().toBuffer();
  }

  private commandParts(command: string, inputPath: string, outputPath: string) {
    return command
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((part) => part.replace(/^"|"$/g, '').replaceAll('{input}', inputPath).replaceAll('{output}', outputPath)) ?? [];
  }

  private runCommand(command: string, args: string[], cwd: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { cwd, windowsHide: true });
      const stderr: Buffer[] = [];
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${command} exited with ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      });
    });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type BackgroundPixelWorkerOptions = {
  width: number;
  height: number;
  channels: number;
  threshold: number;
  feather: number;
  colorTolerance: number;
  cleanupSpeckles: boolean;
  speckleSize: number;
};

function runBackgroundPixelWorker(data: Buffer, options: BackgroundPixelWorkerOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(BACKGROUND_PIXEL_WORKER_SOURCE, {
      eval: true,
      workerData: { data, options },
    });
    worker.once('message', (result: Uint8Array) => resolve(Buffer.from(result)));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Background removal worker exited with ${code}`));
    });
  });
}

const BACKGROUND_PIXEL_WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function removeSmallAlphaIslands(data, width, height, channels, maxArea) {
  const visited = new Uint8Array(width * height);
  const stack = [];
  const component = [];
  const areaLimit = clamp(Math.round(maxArea), 4, 180);

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * channels + 3] <= 12) continue;

    stack.length = 0;
    component.length = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      const x = current % width;
      const neighbors = [current - 1, current + 1, current - width, current + width];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1) continue;
        if (data[neighbor * channels + 3] <= 12) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (component.length <= areaLimit) {
      for (const pixel of component) {
        data[pixel * channels + 3] = 0;
      }
    }
  }
}

const { data, options } = workerData;
const buffer = Buffer.from(data);

for (let index = 0; index < buffer.length; index += options.channels) {
  const red = buffer[index];
  const green = buffer[index + 1];
  const blue = buffer[index + 2];
  const brightness = (red + green + blue) / 3;
  const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
  if (colorSpread > options.colorTolerance) continue;

  if (brightness >= options.threshold) {
    buffer[index + 3] = 0;
  } else if (options.feather > 0 && brightness >= options.threshold - options.feather) {
    const distance = (options.threshold - brightness) / options.feather;
    buffer[index + 3] = Math.round(buffer[index + 3] * clamp(distance, 0, 1));
  }
}

if (options.cleanupSpeckles) {
  removeSmallAlphaIslands(buffer, options.width, options.height, options.channels, options.speckleSize);
}

parentPort.postMessage(buffer);
`;

export function backgroundRemovalCacheKey(options: BackgroundRemovalOptions = {}) {
  return createHash('sha1').update(JSON.stringify(options)).digest('hex');
}
