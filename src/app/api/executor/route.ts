import { NextResponse } from 'next/server'

// all the CORS stuff so localhost can access the server
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400', // 24 hours
};

const PISTON_URL = 'https://emkc.org/api/v2/piston';

// the JUICE, the main stuff ahahaha
interface Submission {
    submission: string;
    language: "javascript" | "python" | "java" | "c++";
}

const submissions: string[] = [];

// Add these interfaces for type safety
interface PistonRunResult {
    stdout: string;
    stderr: string;
    output: string;
    code: number;
    signal: string | null;
}

interface PistonResponse {
    language: string;
    version: string;
    run: PistonRunResult;
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET() {
    return NextResponse.json(submissions, { headers: corsHeaders })
}

export async function POST(request: Request) {
    const code = await request.json() as Submission;

    // Language-specific test cases
    const testCases = {
        javascript: `
            function executeTest() {
                const l1 = new ListNode(0);
                const l2 = new ListNode(0);
                const result = addTwoNumbers(l1, l2);
                const output = [];
                let current = result;
                while (current) {
                    output.push(current.val);
                    current = current.next;
                }
                console.log(JSON.stringify(output));
            }
            executeTest();`,
        python: `
def execute_test():
    l1 = ListNode(0)
    l2 = ListNode(0)
    result = addTwoNumbers(l1, l2)
    output = []
    current = result
    while current:
        output.append(current.val)
        current = current.next
    print(output)

execute_test()`,
        java: `
    public static void main(String[] args) {
        ListNode l1 = new ListNode(0);
        ListNode l2 = new ListNode(0);
        ListNode result = addTwoNumbers(l1, l2);
        java.util.List<Integer> output = new java.util.ArrayList<>();
        while (result != null) {
            output.add(result.val);
            result = result.next;
        }
        System.out.println(output.toString());
    }`,
        "c++": `
int main() {
    ListNode* l1 = new ListNode(0);
    ListNode* l2 = new ListNode(0);
    ListNode* result = addTwoNumbers(l1, l2);
    vector<int> output;
    while (result) {
        output.push_back(result->val);
        result = result->next;
    }
    cout << "[";
    for (size_t i = 0; i < output.size(); ++i) {
        if (i > 0) cout << ",";
        cout << output[i];
    }
    cout << "]" << endl;
    return 0;
}`
    };

    // Language-specific wrappers and includes
    const wrappers = {
        javascript: (code: string) => `${code}\n${testCases.javascript}`,
        python: (code: string) => `${code}\n${testCases.python}`,
        java: (code: string) => `
public class Main {
    ${code}
    ${testCases.java}
}`,
        "c++": (code: string) => `
#include <iostream>
#include <vector>
using namespace std;
${code}
${testCases["c++"]}`,
    };

    // Map our language names to Piston's language names
    const languageMap = {
        'javascript': 'javascript',
        'python': 'python3',
        'java': 'java',
        'c++': 'cpp'
    };

    try {
        const wrappedCode = wrappers[code.language](code.submission);
        
        const response = await fetch(`${PISTON_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                language: languageMap[code.language],
                version: '*',
                files: [{
                    content: wrappedCode
                }]
            })
        });

        const result = await response.json() as PistonResponse;
        
        if (result.run.stderr && !result.run.stdout) {
            throw new Error(result.run.stderr);
        }

        const output = result.run.stdout.trim();
        submissions.push(output);
        
        return NextResponse.json({
            success: true,
            results: output
        }, { headers: corsHeaders });
        
    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Execution failed'
        }, { headers: corsHeaders });
    }
}