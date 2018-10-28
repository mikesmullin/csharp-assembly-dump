# CSharp-Assembly Dump

If you've ever wanted to read [and subsequently edit] the output
of a C# .NET `BinaryFormatter.Serialize()` file, this quickly-made Node.JS script
works for me.

Sample data is provided in `input/` and `output/` directory for comparison.  
(ie. the save game file from a popular indie Unity game: [Bendy and the Ink Machine](https://store.steampowered.com/app/622650/Bendy_and_the_Ink_Machine/))

**NOTICE:** The file format specification is documented here:

- [[MS-NRBF]: .NET Remoting: Binary Format Data Structure](https://msdn.microsoft.com/en-us/library/cc236844.aspx)

**WARNING:** About 75% of the spec is implemented by this script. If it doesn't
work for you, chances are there is work remaining to be completed on this code,
but it should be minimal, and if you were considering writing your own code from
scratch, then this may still be a useful example for you to copy, or complete.
PRs welcome!

## Example invocation:

```bash
node csharp-assembly-dump.js input/batim.game > output/out.log
```
