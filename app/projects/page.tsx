"use client";

import { useEffect, useState } from "react";
import { DesktopNav, HomeMenu } from "@/components/HomeMenu";
import { addProject, deleteProject, listProjects } from "@/lib/db";
import { currentProjectId, setCurrentProjectId } from "@/lib/project";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState(currentProjectId());
  const [name, setName] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lock, setLock] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    setProjects(await listProjects());
    setActive(currentProjectId());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const pending = projects.find((p) => p.id === pendingId);
  const lockOk = pending ? lock.trim().toLowerCase() === pending.name.trim().toLowerCase() : false;
  const onlyOne = projects.length <= 1;

  return (
    <main className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl lg:max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HomeMenu />
          <DesktopNav />
          <h1 className="text-2xl font-semibold md:hidden">Projects</h1>
        </div>
      </div>
      <h1 className="mb-4 hidden text-2xl font-semibold md:block">Projects</h1>
      <div className="max-w-lg">
      <p className="mb-4 text-sm text-muted">Tap a job to open it on this phone.</p>
      <div className="space-y-2">
        {projects.map((p) => {
          const on = p.id === active;
          return (
            <div
              key={p.id}
              className={`rounded-2xl px-4 py-4 ${
                on ? "bg-accent text-accent-ink" : "bg-surface text-ink ring-1 ring-rule"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setCurrentProjectId(p.id);
                  setActive(p.id);
                }}
                className="w-full text-left"
              >
                <p className="text-lg font-semibold">{p.name}</p>
                <p className={`text-sm ${on ? "text-accent-ink/70" : "text-muted"}`}>
                  {on ? "Open now" : "Switch to this job"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setLock("");
                  setPendingId(p.id);
                }}
                className={`mt-3 text-sm ${on ? "text-accent-ink/80" : "text-red-400"}`}
              >
                Delete project
              </button>
            </div>
          );
        })}
      </div>

      {pending ? (
        <div className="mt-4 rounded-2xl bg-red-500/15 p-4">
          <p className="text-sm font-semibold text-red-400">Delete {pending.name}?</p>
          <p className="mt-1 text-sm text-muted">
            This wipes every string, frame, breaker serial, and fault log in this project on this phone.
            It cannot be undone.
          </p>
          {onlyOne ? (
            <p className="mt-2 text-sm text-muted">Add another project first. This is the only one.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink">Type the project name to unlock delete.</p>
              <input
                value={lock}
                onChange={(e) => setLock(e.target.value)}
                placeholder={pending.name}
                className="mt-2 w-full rounded-xl border border-rule bg-surface px-3 py-3 text-ink"
              />
            </>
          )}
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-surface px-4 py-2 text-sm font-medium text-ink ring-1 ring-rule"
              onClick={() => {
                setPendingId(null);
                setLock("");
                setError("");
              }}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              disabled={deleting || onlyOne || !lockOk}
              onClick={async () => {
                setDeleting(true);
                const result = await deleteProject(pending.id);
                setDeleting(false);
                if (!result.ok) {
                  setError("Cannot delete the last project.");
                  return;
                }
                setPendingId(null);
                setLock("");
                await refresh();
              }}
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="mt-6 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const project = await addProject(name);
          setName("");
          setCurrentProjectId(project.id);
          await refresh();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-ink"
        />
        <button type="submit" className="w-full rounded-2xl bg-accent py-4 font-semibold text-accent-ink">
          Add project
        </button>
      </form>
      </div>
    </main>
  );
}
