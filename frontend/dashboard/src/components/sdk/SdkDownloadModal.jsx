import React, { useState, useEffect } from 'react';
import { Download, AlertCircle, CheckCircle2, Copy, Check, Key, Lock } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { projectService, triggerBlobDownload } from '../../services/api';

export const SdkDownloadModal = ({
  isOpen,
  onClose,
  targetProject,
  canManageKeys = true,
  initialOption,
  initialPastedKey = '',
  onKeysUpdated,
}) => {
  const { getProjectSessionKey, setProjectSessionKey } = useProject();
  const sessionKeyInfo = getProjectSessionKey(targetProject?.id);

  const resolveDefaultOption = () => {
    if (!canManageKeys) return 'template';
    if (initialOption) {
      if (initialOption === 'session' && !sessionKeyInfo?.rawKey) return 'new';
      return initialOption;
    }
    if (sessionKeyInfo?.rawKey) return 'session';
    if (initialPastedKey?.trim()) return 'paste';
    return 'template';
  };

  const [downloadOption, setDownloadOption] = useState(resolveDefaultOption);
  const [downloadKeyName, setDownloadKeyName] = useState('SDK Package Key');
  const [downloadPastedKey, setDownloadPastedKey] = useState(initialPastedKey || '');
  const [downloadError, setDownloadError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadResult, setDownloadResult] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDownloadError(null);
      setDownloadResult(null);
      setCopiedSecret(false);
      setDownloadKeyName('SDK Package Key');
      setDownloadPastedKey(initialPastedKey || '');
      if (!canManageKeys) {
        setDownloadOption('template');
      } else if (initialOption === 'session' && !sessionKeyInfo?.rawKey) {
        setDownloadOption('new');
      } else if (initialOption) {
        setDownloadOption(initialOption);
      } else if (sessionKeyInfo?.rawKey) {
        setDownloadOption('session');
      } else if (initialPastedKey?.trim()) {
        setDownloadOption('paste');
      } else {
        setDownloadOption('template');
      }
    }
  }, [isOpen, targetProject?.id, canManageKeys, initialOption, initialPastedKey, sessionKeyInfo?.rawKey]);

  if (!isOpen || !targetProject) return null;

  const handleClose = () => {
    setDownloadError(null);
    setDownloadResult(null);
    setCopiedSecret(false);
    onClose?.();
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetProject?.id) return;

    setDownloadError(null);
    setDownloading(true);

    try {
      let result;
      let mintedRawKey = null;
      let mintedKeyName = '';

      if (downloadOption === 'session') {
        if (!sessionKeyInfo?.rawKey) {
          setDownloadError('No active session key available for this project. Select another option.');
          setDownloading(false);
          return;
        }
        result = await projectService.downloadSdk(targetProject.id, {
          mode: 'existing',
          api_key: sessionKeyInfo.rawKey,
          key_name: sessionKeyInfo.keyName,
        });
      } else if (downloadOption === 'paste') {
        const key = downloadPastedKey.trim();
        if (!key || !key.startsWith('ask_')) {
          setDownloadError('Please enter a valid SDK API key starting with ask_');
          setDownloading(false);
          return;
        }
        result = await projectService.downloadSdk(targetProject.id, {
          mode: 'existing',
          api_key: key,
        });
      } else if (downloadOption === 'template') {
        result = await projectService.downloadSdk(targetProject.id, {
          mode: 'template',
        });
      } else if (downloadOption === 'new') {
        const name = downloadKeyName.trim() || 'SDK Package Key';
        const res = await projectService.createKey(targetProject.id, name);
        const keyObj = res.data?.key || {};
        const raw = keyObj.raw_key || res.data?.raw_key;
        if (!raw) {
          setDownloadError('Key created, but raw secret was not returned.');
          setDownloading(false);
          return;
        }
        mintedRawKey = raw;
        mintedKeyName = name;
        setProjectSessionKey(targetProject.id, {
          rawKey: raw,
          keyName: name,
          keyPrefix: keyObj.key_prefix,
        });
        onKeysUpdated?.();
        result = await projectService.downloadSdk(targetProject.id, {
          mode: 'existing',
          api_key: raw,
          key_name: name,
        });
      }

      if (result?.blob) {
        triggerBlobDownload(result.blob, result.filename);
        setDownloadResult({
          filename: result.filename,
          mode: downloadOption,
          keyMode: result.keyMode,
          keyName: mintedKeyName || result.keyName || 'SDK Key',
          keyPrefix: result.keyPrefix || 'N/A',
          rawKey: mintedRawKey,
        });
      }
    } catch (err) {
      console.error('Failed to configure SDK download:', err);
      setDownloadError(err.response?.data?.error || 'Failed to prepare SDK download');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-[#101216] border border-[#2A2E37] rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E2127] pb-3">
          <div className="flex items-center space-x-2 text-[#E6E8EB] font-semibold">
            {downloadResult ? (
              <CheckCircle2 className="w-5 h-5 text-[#C3E88D]" />
            ) : (
              <Download className="w-5 h-5 text-[#82AAFF]" />
            )}
            <h3 className="text-sm font-semibold text-[#E6E8EB]">
              {downloadResult ? 'SDK Package Downloaded' : 'Download Preconfigured SDK Package'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-[#7B818B] hover:text-[#E6E8EB] p-1 font-mono cursor-pointer text-xs"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div>
          <p className="text-xs text-[#9BA1AC] font-mono">
            Target Project:{' '}
            <span className="text-[#82AAFF] font-semibold">{targetProject.name}</span>{' '}
            <span className="text-[#7B818B]">({targetProject.id})</span>
          </p>
          {!downloadResult && (
            <p className="text-[11px] text-[#7B818B] mt-1 font-mono">
              Select which credential to bundle into <code className="text-[#82AAFF]">config.py</code> inside the ZIP archive:
            </p>
          )}
        </div>

        {downloadResult ? (
          <div className="space-y-3.5 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-[#0A0B0D] border border-[#1E2127] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#7B818B] text-[11px]">Archive:</span>
                <span className="text-[#E6E8EB] font-semibold">{downloadResult.filename}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7B818B] text-[11px]">Credential Mode:</span>
                <span className="text-[#82AAFF] uppercase text-[11px]">
                  {downloadResult.mode === 'template' ? 'Zero-Secret Template' : 'Bundled Secret Key'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7B818B] text-[11px]">Key Label:</span>
                <span className="text-[#E6E8EB]">{downloadResult.keyName}</span>
              </div>
              {downloadResult.mode !== 'template' && (
                <div className="flex items-center justify-between">
                  <span className="text-[#7B818B] text-[11px]">Key Prefix:</span>
                  <span className="text-[#C3E88D]">{downloadResult.keyPrefix}</span>
                </div>
              )}
            </div>

            {downloadResult.rawKey && (
              <div className="p-3.5 rounded-xl bg-[#C3E88D]/10 border border-[#C3E88D]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#C3E88D] uppercase tracking-wider flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5" />
                    <span>Newly Provisioned Secret Key</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(downloadResult.rawKey)}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-[#101216] border border-[#2A2E37] text-[11px] text-[#E6E8EB] hover:border-[#C3E88D] cursor-pointer"
                  >
                    {copiedSecret ? <Check className="w-3 h-3 text-[#C3E88D]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSecret ? 'Copied' : 'Copy Key'}</span>
                  </button>
                </div>
                <div className="p-2 rounded bg-[#0A0B0D] border border-[#1E2127] text-[#C3E88D] break-all select-all text-[11px]">
                  {downloadResult.rawKey}
                </div>
                <p className="text-[10px] text-[#9BA1AC]">
                  This key is embedded in <code className="text-[#E6E8EB]">config.py</code> inside your ZIP and saved in memory for this session only.
                </p>
              </div>
            )}

            {downloadResult.mode === 'template' && (
              <p className="text-[11px] text-[#9BA1AC]">
                No secret key was written to the ZIP. Set <code className="text-[#82AAFF]">SECURITY_SDK_API_KEY</code> in your runtime environment before starting your app.
              </p>
            )}

            <div className="flex justify-end pt-2 border-t border-[#1E2127]">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-1.5 text-xs bg-[#C3E88D] hover:bg-[#d4f2aa] text-[#0A0B0D] font-semibold rounded-full cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {!canManageKeys && (
              <div className="p-2.5 rounded-xl bg-[#16181D] border border-[#2A2E37] text-[11px] font-mono text-[#9BA1AC] flex items-start space-x-2">
                <Lock className="w-3.5 h-3.5 text-[#E5C07B] shrink-0 mt-0.5" />
                <span>
                  Your workspace role is read-only for secret keys. You can download the Zero-Secret Template; ask an Owner or Admin to provision or bundle a secret key.
                </span>
              </div>
            )}

            {downloadError && (
              <div className="p-2.5 rounded bg-[#F07178]/10 border border-[#F07178]/30 text-xs font-mono text-[#F07178] flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2.5 font-mono text-xs">
                {/* Option 1: Active Session Key */}
                {canManageKeys && sessionKeyInfo?.rawKey && (
                  <label
                    className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                      downloadOption === 'session'
                        ? 'bg-[#16181D] border-[#C3E88D] text-[#E6E8EB]'
                        : 'bg-[#101216] border-[#1E2127] hover:border-[#2A2E37] text-[#9BA1AC]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="sdkKeyOption"
                        value="session"
                        checked={downloadOption === 'session'}
                        onChange={() => setDownloadOption('session')}
                        className="text-[#C3E88D] focus:ring-0"
                      />
                      <span className="font-semibold text-xs text-[#E6E8EB]">Use Active Session Key</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#C3E88D]/15 text-[#C3E88D] border border-[#C3E88D]/30 font-semibold">
                        In Memory
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7B818B] mt-1 ml-5 truncate font-mono">
                      Bundles <span className="text-[#E6E8EB]">{sessionKeyInfo.keyName}</span> ({sessionKeyInfo.keyPrefix}) into package.
                    </p>
                  </label>
                )}

                {/* Option 2: Zero-Secret Template Mode */}
                <label
                  className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                    downloadOption === 'template'
                      ? 'bg-[#16181D] border-[#C792EA] text-[#E6E8EB]'
                      : 'bg-[#101216] border-[#1E2127] hover:border-[#2A2E37] text-[#9BA1AC]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="sdkKeyOption"
                      value="template"
                      checked={downloadOption === 'template'}
                      onChange={() => setDownloadOption('template')}
                      className="text-[#C792EA] focus:ring-0"
                    />
                    <span className="font-semibold text-xs text-[#E6E8EB]">Zero-Secret Template (Environment Variables)</span>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#C792EA]/15 text-[#C792EA] border border-[#C792EA]/30 font-semibold">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7B818B] mt-1 ml-5">
                    No plaintext key in zip. Package reads <code className="text-[#82AAFF]">SECURITY_SDK_API_KEY</code> from system environment at runtime.
                  </p>
                </label>

                {/* Option 3: Generate New Dedicated Key */}
                {canManageKeys && (
                  <label
                    className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                      downloadOption === 'new'
                        ? 'bg-[#16181D] border-[#82AAFF] text-[#E6E8EB]'
                        : 'bg-[#101216] border-[#1E2127] hover:border-[#2A2E37] text-[#9BA1AC]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="sdkKeyOption"
                        value="new"
                        checked={downloadOption === 'new'}
                        onChange={() => setDownloadOption('new')}
                        className="text-[#82AAFF] focus:ring-0"
                      />
                      <span className="font-semibold text-xs text-[#E6E8EB]">Generate Named Key for this Package</span>
                    </div>
                    <p className="text-[11px] text-[#7B818B] mt-1 ml-5">
                      Provisions a dedicated active key in this project and reveals it after download.
                    </p>
                    {downloadOption === 'new' && (
                      <div className="mt-2.5 ml-5">
                        <input
                          type="text"
                          required
                          value={downloadKeyName}
                          onChange={(e) => setDownloadKeyName(e.target.value)}
                          placeholder="e.g. Local Dev Environment SDK"
                          className="w-full bg-[#0A0B0D] border border-[#2A2E37] focus:border-[#82AAFF] rounded px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                        />
                      </div>
                    )}
                  </label>
                )}

                {/* Option 4: Paste Existing Secret */}
                {canManageKeys && (
                  <label
                    className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                      downloadOption === 'paste'
                        ? 'bg-[#16181D] border-[#C3E88D] text-[#E6E8EB]'
                        : 'bg-[#101216] border-[#1E2127] hover:border-[#2A2E37] text-[#9BA1AC]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="sdkKeyOption"
                        value="paste"
                        checked={downloadOption === 'paste'}
                        onChange={() => setDownloadOption('paste')}
                        className="text-[#C3E88D] focus:ring-0"
                      />
                      <span className="font-semibold text-xs text-[#E6E8EB]">Paste Existing Key Secret</span>
                    </div>
                    <p className="text-[11px] text-[#7B818B] mt-1 ml-5">
                      Paste a key secret you previously copied and saved.
                    </p>
                    {downloadOption === 'paste' && (
                      <div className="mt-2.5 ml-5">
                        <input
                          type="text"
                          required
                          value={downloadPastedKey}
                          onChange={(e) => setDownloadPastedKey(e.target.value)}
                          placeholder="ask_..."
                          className="w-full bg-[#0A0B0D] border border-[#2A2E37] focus:border-[#C3E88D] rounded px-3 py-1.5 text-xs text-[#E6E8EB] focus:outline-none transition-colors"
                        />
                      </div>
                    )}
                  </label>
                )}
              </div>

              <div className="flex justify-end space-x-2.5 pt-3 border-t border-[#1E2127]">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 text-xs text-[#9BA1AC] hover:text-[#E6E8EB] rounded cursor-pointer transition-colors font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={downloading}
                  className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs bg-[#82AAFF] hover:bg-[#9bbdff] text-[#0A0B0D] font-semibold font-mono rounded-full cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloading ? 'Preparing Package...' : 'Download Package (.zip)'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default SdkDownloadModal;
