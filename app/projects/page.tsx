"use client";

import { useEffect, useState } from "react";
import { HomeMenu } from "@/components/HomeMenu";
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
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <HomeMenu />
        <h1 className="text-2xl font-semibold">Projects</h1>
      </div>
      <p className="mb-4 text-sm text-neutral-600">Tap a job to open it on this phone.</p>
      <div className="space-y-2">
        {projects.map((p) => {
          const on = p.id === active;
          return (
            <div
              key={p.id}
              className={`rounded-2xl px-4 py-4 ${on ? "bg-ink text-white" : "bg-white"}`}
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
                <p className={`text-sm ${on ? "text-white/70" : "text-neutral-500"}`}>
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
                className={`mt-3 text-sm ${on ? "text-red-200" : "text-red-700"}`}
              >
                Delete project
              </button>
            </div>
          );
        })}
      </div>

      {pending ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Delete {pending.name}?</p>
          <p className="mt-1 text-sm text-red-800">
            This wipes every string, frame, breaker serial, and fault log in this project on this phone.
            It cannot be undone.
          </p>
          {onlyOne ? (
            <p className="mt-2 text-sm text-red-800">Add another project first. This is the only one.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-red-900">Type the project name to unlock delete.</p>
              <input
                value={lock}
                onChange={(e) => setLock(e.target.value)}
                placeholder={pending.name}
                className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-3"
              />
            </>
          )}
          {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium ring-1 ring-rule"
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
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
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
          className="w-full rounded-2xl border border-rule px-4 py-3"
        />
        <button type="submit" className="w-full rounded-2xl bg-ink py-4 text-white">
          Add project
        </button>
      </form>
    </main>
  );
}
