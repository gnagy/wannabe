import { describe, expect, test } from "bun:test";
import { pinImage, serviceImage } from "../lib/compose.ts";

const compose = `services:
  app:
    image: "registry.example.com/app:1"   # the application
    environment:
      - "IMAGE=registry.example.com/app:1"
  worker:
    image: registry.example.com/app:1
  'quoted-name':
    image: 'registry.example.com/other:7'

volumes:
  data: {}
`;

describe("serviceImage", () => {
  test("reads a service's image", () => {
    expect(serviceImage(compose, "app")).toBe("registry.example.com/app:1");
    expect(serviceImage(compose, "quoted-name")).toBe("registry.example.com/other:7");
    expect(serviceImage(compose, "missing")).toBeUndefined();
  });
});

describe("pinImage", () => {
  test("changes only that service's image line, keeping quotes and comments", () => {
    const { text, changed } = pinImage(compose, "app", "registry.example.com/app:2");
    expect(changed).toHaveLength(1);
    expect(text).toContain('    image: "registry.example.com/app:2"   # the application');
    // The same image elsewhere — another service, an environment value — is left alone.
    expect(text).toContain("    image: registry.example.com/app:1\n");
    expect(text).toContain('"IMAGE=registry.example.com/app:1"');
    expect(serviceImage(text, "app")).toBe("registry.example.com/app:2");
  });

  test("finds services whose key is quoted", () => {
    const { text } = pinImage(compose, "quoted-name", "registry.example.com/other:8");
    expect(text).toContain("    image: 'registry.example.com/other:8'");
  });

  test("changes nothing when the image is already set, or the service is missing", () => {
    expect(pinImage(compose, "app", "registry.example.com/app:1").changed).toHaveLength(0);
    expect(pinImage(compose, "missing", "x:1").text).toBe(compose);
  });

  test("keeps everything else byte for byte", () => {
    const { text } = pinImage(compose, "worker", "registry.example.com/app:9");
    expect(text.split("\n").filter((line, i) => line !== compose.split("\n")[i])).toEqual([
      "    image: registry.example.com/app:9",
    ]);
  });
});
