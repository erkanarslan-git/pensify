import { expect, it } from "vitest";
import { validTodoAttachment } from "./todo-attachments";
it("optional task attachments accept only images and PDF up to 10MB", () => {
  expect(validTodoAttachment({size:10*1024*1024,type:"application/pdf"})).toBe(true);
  expect(validTodoAttachment({size:10*1024*1024+1,type:"application/pdf"})).toBe(false);
  expect(validTodoAttachment({size:100,type:"text/html"})).toBe(false);
});