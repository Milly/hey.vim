import { ChatOpenAI } from "https://esm.sh/langchain/chat_models/openai";
import { HumanChatMessage, SystemChatMessage } from "https://esm.sh/langchain/schema";

import { Denops } from "https://lib.deno.dev/x/denops_std@v4/mod.ts";
import * as helper from "https://lib.deno.dev/x/denops_std@v4/helper/mod.ts";
import * as vars from "https://lib.deno.dev/x/denops_std@v4/variable/mod.ts";
import * as fn from "https://lib.deno.dev/x/denops_std@v4/function/mod.ts";
import outdent from 'https://lib.deno.dev/x/outdent@v0.8.x/mod.ts';

async function hey(denops: Denops, firstline: number, lastline: number, request: string) {
  const target = (await fn.getline(denops, firstline, lastline)).join("\n");
  const indent = " ".repeat(await fn.indent(denops, firstline));
  await fn.deletebufline(denops, "%", firstline+1, lastline);
  await fn.setline(denops, firstline, [indent]);
  await fn.setcursorcharpos(denops, firstline, 0);

  const model = new ChatOpenAI({
    modelName: await vars.g.get(denops, "hey_model_name", "gpt-3.5-turbo"),
    verbose: await vars.g.get(denops, "hey_verbose", false),
    streaming: true,
    callbacks: [
      {
        async handleLLMNewToken(token: string) {
          const [bufn, lnum, col, off] = await fn.getcursorcharpos(denops);
          const lines = (await fn.getline(denops, lnum) + token.replace("\n", "\n"+indent)).split("\n");
          await fn.append(denops, lnum, Array(lines.length - 1).fill(""));
          await fn.setline(denops, lnum, lines);
          await fn.setcursorcharpos(denops, lnum + lines.length - 1, col);
        }
      }
    ]
  });

  const systemPrompt = outdent`
    Act a professional ${ await vars.o.get(denops, "filetype") } code/ prose writer for:
    - helping human to write code (e.g., auto-completion)
    - helping human to write prose (e.g., grammar/ spelling correction)

    The condition of the answer is:
    - Ask no question regarding the request.
    - Must be only text according to the request.
    - Must contain line breaks for each 80 letters.
    - Must generate the concise text for any request.

    <ExampleInput>
    <Request>${ request }</Request>
    <Target>${ outdent.string("\n"+target) }</Target>
    </ExampleInput>
    <ExampleOutput>${ outdent.string("\n"+target) }</ExampleOutput>
  `;

  const userPrompt = outdent`
    <Request>${ request }</Request>
    <Target>${ outdent.string("\n"+target) }</Target>
  `;

  model.call([
    new SystemChatMessage(systemPrompt),
    new HumanChatMessage(userPrompt)
  ]);
}

export async function main(denops: Denops) {
  denops.dispatcher = {
    hey(...args: any[]) {
      hey(denops, ...args);
    }
  };
  await helper.execute(denops, outdent`
    function! Hey(prompt) range abort
      let s:seq_curs = get(s:, "seq_curs", [])
      call add(s:seq_curs, undotree()["seq_cur"])
      let s:firstline = a:firstline
      let s:lastline = a:lastline
      let s:prompt = a:prompt
      call denops#notify("${denops.name}", "hey", [s:firstline, s:lastline, s:prompt])
    endfunction
    command! -nargs=1 -range Hey <line1>,<line2>call Hey(<q-args>)

    function! HeyUndo() abort
      execute 'undo' s:seq_curs[-1]
      call remove(s:seq_curs, -1)
    endfunction
    command! HeyUndo call HeyUndo()
    map <Plug>HeyUndo <Cmd>HeyUndo<CR>

    function! HeyAgain() abort
      call add(s:seq_curs, undotree()["seq_cur"])
      execute 'undo' s:seq_curs[-2]
      call denops#notify("${denops.name}", "hey", [s:firstline, s:lastline, s:prompt])
    endfunction
    command! HeyAgain call HeyAgain()
    map <Plug>HeyAgain <Cmd>HeyAgain<CR>
  `)
}
