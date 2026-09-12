import { NextResponse } from "next/server";
import { DEFAULT_PROJECT_ID } from "@/lib/project";
import {
  storeAddFault,
  storeAddProject,
  storePutProject,
  storeDeleteFrame,
  storeDeleteProject,
  storeDeleteString,
  storeFindFrameBySlot,
  storeGetFrame,
  storeGetInstaller,
  storeImport,
  storeListFaults,
  storeListFrames,
  storeListInstallers,
  storeListProjects,
  storeListStrings,
  storePutString,
  storeSaveFrame,
  storeSaveInstaller,
  storeSearchBreakers,
  storeStatus,
} from "@/lib/serverStore";
import type { Fault, Frame, Installer, Project } from "@/lib/types";
import type { StringRecord } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const projectId = url.searchParams.get("projectId") || DEFAULT_PROJECT_ID;
    if (action === "status") return NextResponse.json(await storeStatus());
    if (action === "listProjects") return NextResponse.json(await storeListProjects());
    if (action === "listFrames") return NextResponse.json(await storeListFrames(projectId));
    if (action === "listStrings") return NextResponse.json(await storeListStrings(projectId));
    if (action === "listFaults") return NextResponse.json(await storeListFaults(projectId));
    if (action === "listInstallers") return NextResponse.json(await storeListInstallers());
    if (action === "getFrame") {
      const frame = await storeGetFrame(url.searchParams.get("id") || "");
      return NextResponse.json(frame ?? null);
    }
    if (action === "searchBreakers") {
      const q = url.searchParams.get("q") || "";
      return NextResponse.json(await storeSearchBreakers(projectId, q));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "store failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "saveFrame") {
      await storeSaveFrame(body.frame as Frame);
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteFrame") {
      await storeDeleteFrame(String(body.id || ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "putProject") {
      await storePutProject(body.project as Project);
      return NextResponse.json({ ok: true });
    }
    if (action === "addProject") {
      const project = await storeAddProject(String(body.name || ""));
      return NextResponse.json(project);
    }
    if (action === "deleteProject") {
      const result = await storeDeleteProject(String(body.id || ""));
      return NextResponse.json(result);
    }
    if (action === "putString") {
      await storePutString(body.string as StringRecord);
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteString") {
      await storeDeleteString(String(body.projectId || DEFAULT_PROJECT_ID), String(body.key || ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "saveInstaller") {
      await storeSaveInstaller(body.installer as Installer);
      return NextResponse.json({ ok: true });
    }
    if (action === "lookupInstaller") {
      const installer = await storeGetInstaller(String(body.initials || ""));
      return NextResponse.json(installer ?? null);
    }
    if (action === "addFault") {
      await storeAddFault(body.fault as Fault);
      return NextResponse.json({ ok: true });
    }
    if (action === "findFrameBySlot") {
      const frame = await storeFindFrameBySlot(
        String(body.projectId || DEFAULT_PROJECT_ID),
        String(body.stringKey || ""),
        String(body.frameSlot || ""),
      );
      return NextResponse.json(frame ?? null);
    }
    if (action === "import") {
      await storeImport({
        projects: (body.projects as Project[]) || [],
        strings: (body.strings as StringRecord[]) || [],
        frames: (body.frames as Frame[]) || [],
        faults: (body.faults as Fault[]) || [],
        installers: (body.installers as Installer[]) || [],
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "store failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
