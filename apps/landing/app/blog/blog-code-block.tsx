"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/code-tabs";
import { cn } from "@/lib/utils";
import { Highlight } from "prism-react-renderer";
import { useState } from "react";
import React from "react";
import { CopyButton } from "../../components/copy-button";
import { BlogCodeDownload } from "../../components/svg/blog-code-block";
import darkTheme from "./dark-theme";

export function BlogCodeBlock({ className, children }: any) {
  const blocks = React.Children.map(children, (child: any) => child.props.children.props);

  const buttonLabels = React.Children.map(children, (child: any) =>
    child?.props?.children?.props?.className.replace(/language-/, "").split(" "),
  );
  const [copyData, setCopyData] = useState(blocks[0].children);

  function handleDownload() {
    const element = document.createElement("a");
    const file = new Blob([copyData], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "code.txt";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }
  function handlelOnChange(current: any) {
    blocks.map((block: any) => {
      const lang = block.className.replace(/language-/, "");
      if (lang === current[0].toString()) {
        setCopyData(block.children);
      }
    });
  }
  return (
    <div
      className={cn(
        "flex flex-col bg-gradient-to-t from-[rgba(255,255,255,0.1)] to-[rgba(255,255,255,0.07)] rounded-[20px] border-[.5px] border-[rgba(255,255,255,0.1)]",
        className,
      )}
    >
      <Tabs
        defaultValue={buttonLabels[0]}
        onValueChange={(value) => handlelOnChange(value)}
        className="flex flex-col"
      >
        <div className="flex flex-row border-b-[.5px] border-white/10 p-2">
          <TabsList className="w-full flex flex-row gap-4 justify-start h-fit align-bottom">
            {React.Children.map(buttonLabels, (label: string) => {
              return (
                <TabsTrigger key={label} value={label} className="capitalize text-white/30">
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="flex flex-row gap-4 pr-4 pt-2">
            <CopyButton value={copyData} />
            <button type="button" className="p-0 m-0 bg-transparent" onClick={handleDownload}>
              <BlogCodeDownload />
            </button>
          </div>
        </div>
        {blocks.map((block: any, index: number) => {
          return (
            <TabsContent value={buttonLabels[index]} key={buttonLabels[index]} className="pr-12">
              <Highlight
                theme={darkTheme}
                code={block.children}
                language={block.className.replace(/language-/, "")}
              >
                {({ tokens, getLineProps, getTokenProps }) => (
                  <pre className="leading-10 border-none rounded-none bg-transparent overflow-x-auto ">
                    {tokens.map((line, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: I got nothing better right now
                        key={`${line}-${i}`}
                        {...getLineProps({ line })}
                      >
                        <span className="pl-4 pr-8 text-white/20 text-center">{i + 1}</span>
                        {line.map((token, key) => (
                          <span key={` ${key}-${token}`} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
export function BlogCodeBlockSingle({ className, children }: any) {
  const block = children.props;

  const [copyData, _setCopyData] = useState(block.children);

  function handleDownload() {
    const element = document.createElement("a");
    const file = new Blob([copyData], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "code.txt";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }
  return (
    <div
      className={cn(
        "flex flex-col bg-gradient-to-t from-[rgba(255,255,255,0.1)] to-[rgba(255,255,255,0.07)] rounded-[20px] border-[.5px] border-[rgba(255,255,255,0.1)]",
        className,
      )}
    >
      <div className="flex flex-row gap-2 border-white/10 p-2 pr-4 justify-end w-full ">
        <CopyButton value={copyData} />
        <button type="button" className="p-0 m-0 bg-transparent" onClick={handleDownload}>
          <BlogCodeDownload />
        </button>
      </div>
      <Highlight
        theme={darkTheme}
        code={block.children}
        language={block.className.replace(/language-/, "")}
      >
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="leading-10 border-none rounded-none bg-transparent overflow-x-auto ">
            {tokens.map((line, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: I got nothing better right now
                key={`${line}-${i}`}
                {...getLineProps({ line })}
              >
                <span className="pl-4 pr-8 text-white/20 text-center">{i + 1}</span>
                {line.map((token, key) => (
                  <span key={` ${key}-${token}`} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
